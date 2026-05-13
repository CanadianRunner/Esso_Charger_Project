using PumpCharger.Api.Config;

namespace PumpCharger.Api.Services.External.Fake;

/// <summary>
/// In-memory simulator for the HPWC. Models a single Tesla charging session
/// per explicit trigger: Idle (stays until <see cref="PlugIn"/>), Plugged
/// (brief handshake), Charging (with a ramp → plateau → taper → trickle
/// power profile), SessionComplete (brief), back to Idle.
///
/// Time inputs come from an injected <see cref="Func{DateTime}"/> that
/// already returns sim-time — the simulator does no acceleration math of its
/// own. See <see cref="SimulatedClock"/> for how sim-time is produced in
/// production fake mode; tests typically inject a manually-controlled clock.
/// </summary>
public class FakeHpwcSimulator
{
    private readonly FakeHpwcOptions _opts;
    private readonly Func<DateTime> _clock;
    private readonly DateTime _simStartedAtUtc;
    private readonly object _lock = new();

    private AnchorPoint _anchor;
    private DateTime? _networkFailureUntilUtc;
    private int? _pendingChargingDurationSeconds;

    public FakeHpwcSimulator(FakeHpwcOptions opts, Func<DateTime> clock)
    {
        _opts = opts;
        _clock = clock;
        _simStartedAtUtc = _clock();
        _anchor = new AnchorPoint(
            State: SimState.Idle,
            AtUtc: _simStartedAtUtc,
            LifetimeWh: opts.InitialLifetimeWh,
            SessionWh: 0,
            ContactorCycles: 0,
            ConnectorCycles: 0,
            ChargeStarts: 0,
            ChargingTimeS: 0,
            SessionStartedAtUtc: null,
            ChargingStartedAtUtc: null,
            ChargingDurationSeconds: null);
    }

    public bool IsNetworkFailing => _networkFailureUntilUtc is { } until && _clock() < until;

    public SimSnapshot CurrentSnapshot()
    {
        lock (_lock)
        {
            AdvanceToNow();
            return BuildSnapshot();
        }
    }

    /// <summary>
    /// Start a new session. Optionally override the charging duration for
    /// this session in sim-seconds; otherwise the configured default
    /// (<see cref="FakeHpwcOptions.ChargingDurationSeconds"/>) is used.
    /// </summary>
    public SimSnapshot PlugIn(int? chargingDurationSeconds = null)
    {
        lock (_lock)
        {
            _pendingChargingDurationSeconds = chargingDurationSeconds ?? _opts.ChargingDurationSeconds;
            return Jump(SimState.Plugged);
        }
    }

    public SimSnapshot Unplug() => Jump(SimState.Idle);

    public void SimulateNetworkFailure(TimeSpan duration)
    {
        lock (_lock)
        {
            _networkFailureUntilUtc = _clock() + duration;
        }
    }

    public void ClearNetworkFailure()
    {
        lock (_lock)
        {
            _networkFailureUntilUtc = null;
        }
    }

    private SimSnapshot Jump(SimState target)
    {
        lock (_lock)
        {
            AdvanceToNow();
            CommitPartial();

            var now = _clock();
            var sessionStart = _anchor.SessionStartedAtUtc;
            var sessionWh = _anchor.SessionWh;
            var contactorCycles = _anchor.ContactorCycles;
            var chargeStarts = _anchor.ChargeStarts;
            var connectorCycles = _anchor.ConnectorCycles;
            DateTime? chargingStarted = _anchor.ChargingStartedAtUtc;
            double? chargingDuration = _anchor.ChargingDurationSeconds;

            if (!IsContactorClosed(_anchor.State) && IsContactorClosed(target))
            {
                contactorCycles++;
                chargeStarts++;
            }
            if (!IsVehicleConnected(_anchor.State) && IsVehicleConnected(target))
            {
                connectorCycles++;
                sessionStart = now;
            }
            else if (IsVehicleConnected(_anchor.State) && !IsVehicleConnected(target))
            {
                sessionStart = null;
                sessionWh = 0;
            }

            if (target == SimState.Charging)
            {
                chargingStarted = now;
                chargingDuration = _pendingChargingDurationSeconds ?? _opts.ChargingDurationSeconds;
            }
            else if (target == SimState.Idle)
            {
                chargingStarted = null;
                chargingDuration = null;
            }

            _anchor = _anchor with
            {
                State = target,
                AtUtc = now,
                SessionStartedAtUtc = sessionStart,
                SessionWh = sessionWh,
                ContactorCycles = contactorCycles,
                ConnectorCycles = connectorCycles,
                ChargeStarts = chargeStarts,
                ChargingStartedAtUtc = chargingStarted,
                ChargingDurationSeconds = chargingDuration,
            };

            return BuildSnapshot();
        }
    }

    private void AdvanceToNow()
    {
        // Idle never auto-leaves; only an explicit PlugIn() advances out of Idle.
        if (_anchor.State == SimState.Idle) return;

        const int maxIterations = 10_000;
        for (var i = 0; i < maxIterations; i++)
        {
            var elapsedSim = (_clock() - _anchor.AtUtc).TotalSeconds;
            if (elapsedSim <= 0) return;
            var duration = StateDurationSeconds(_anchor.State);
            if (elapsedSim < duration) return;

            var newAnchorAt = _anchor.AtUtc.AddSeconds(duration);
            _anchor = NaturalTransition(_anchor, newAnchorAt, duration);
            if (_anchor.State == SimState.Idle) return;
        }
    }

    private void CommitPartial()
    {
        var now = _clock();
        var elapsedSim = (now - _anchor.AtUtc).TotalSeconds;
        if (elapsedSim <= 0) return;

        var addedWh = ChargingEnergyWh(_anchor, elapsedSim);
        var addedChargingTime = _anchor.State == SimState.Charging ? (long)elapsedSim : 0;

        _anchor = _anchor with
        {
            AtUtc = now,
            LifetimeWh = _anchor.LifetimeWh + addedWh,
            SessionWh = _anchor.SessionWh + addedWh,
            ChargingTimeS = _anchor.ChargingTimeS + addedChargingTime,
        };
    }

    private AnchorPoint NaturalTransition(AnchorPoint prev, DateTime at, double simSecondsConsumed)
    {
        var lifetimeWh = prev.LifetimeWh;
        var sessionWh = prev.SessionWh;
        var chargingTimeS = prev.ChargingTimeS;
        var sessionStart = prev.SessionStartedAtUtc;
        var chargingStarted = prev.ChargingStartedAtUtc;
        var chargingDuration = prev.ChargingDurationSeconds;
        var contactorCycles = prev.ContactorCycles;
        var connectorCycles = prev.ConnectorCycles;
        var chargeStarts = prev.ChargeStarts;

        // Energy accumulated during the just-completed state lifetime.
        var wh = ChargingEnergyWh(prev, simSecondsConsumed);
        lifetimeWh += wh;
        sessionWh += wh;
        if (prev.State == SimState.Charging) chargingTimeS += (long)simSecondsConsumed;

        var next = prev.State switch
        {
            SimState.Plugged => SimState.Charging,
            SimState.Charging => SimState.SessionComplete,
            SimState.SessionComplete => SimState.Idle,
            // Idle is handled by the guard in AdvanceToNow; treat as no-op.
            SimState.Idle => SimState.Idle,
            _ => throw new InvalidOperationException($"Unknown state {prev.State}"),
        };

        if (!IsContactorClosed(prev.State) && IsContactorClosed(next))
        {
            contactorCycles++;
            chargeStarts++;
        }
        if (!IsVehicleConnected(prev.State) && IsVehicleConnected(next))
        {
            connectorCycles++;
            sessionStart = at;
        }
        else if (IsVehicleConnected(prev.State) && !IsVehicleConnected(next))
        {
            sessionStart = null;
            sessionWh = 0;
        }

        if (next == SimState.Charging)
        {
            chargingStarted = at;
            chargingDuration = _pendingChargingDurationSeconds ?? _opts.ChargingDurationSeconds;
        }
        else if (next == SimState.Idle)
        {
            chargingStarted = null;
            chargingDuration = null;
        }

        return prev with
        {
            State = next,
            AtUtc = at,
            LifetimeWh = lifetimeWh,
            SessionWh = sessionWh,
            ChargingTimeS = chargingTimeS,
            SessionStartedAtUtc = sessionStart,
            ContactorCycles = contactorCycles,
            ConnectorCycles = connectorCycles,
            ChargeStarts = chargeStarts,
            ChargingStartedAtUtc = chargingStarted,
            ChargingDurationSeconds = chargingDuration,
        };
    }

    private SimSnapshot BuildSnapshot()
    {
        var now = _clock();
        var elapsedSim = Math.Max(0, (now - _anchor.AtUtc).TotalSeconds);

        var liveKw = 0.0;
        var addedWh = 0L;
        if (_anchor.State == SimState.Charging && _anchor.ChargingStartedAtUtc is { } startedAt
            && _anchor.ChargingDurationSeconds is { } totalDuration)
        {
            var chargingElapsedNow = (now - startedAt).TotalSeconds;
            liveKw = ProfileKw(chargingElapsedNow, totalDuration);
            addedWh = ChargingEnergyWh(_anchor, elapsedSim);
        }

        var addedChargingTime = _anchor.State == SimState.Charging ? (long)elapsedSim : 0;

        var sessionElapsed = _anchor.SessionStartedAtUtc is { } start
            ? (int)Math.Max(0, (now - start).TotalSeconds)
            : 0;

        var uptimeS = (long)((now - _simStartedAtUtc).TotalSeconds);

        return new SimSnapshot
        {
            State = _anchor.State,
            AsOfUtc = now,
            VehicleConnected = IsVehicleConnected(_anchor.State),
            ContactorClosed = IsContactorClosed(_anchor.State),
            LiveKw = liveKw,
            LifetimeWh = _anchor.LifetimeWh + addedWh,
            SessionWh = _anchor.SessionWh + addedWh,
            SessionElapsedSeconds = sessionElapsed,
            ContactorCycles = _anchor.ContactorCycles,
            ConnectorCycles = _anchor.ConnectorCycles,
            ChargeStarts = _anchor.ChargeStarts,
            ChargingTimeS = _anchor.ChargingTimeS + addedChargingTime,
            UptimeS = uptimeS,
        };
    }

    private long ChargingEnergyWh(AnchorPoint anchor, double elapsedSimSeconds)
    {
        if (anchor.State != SimState.Charging || elapsedSimSeconds <= 0) return 0;
        if (anchor.ChargingStartedAtUtc is null || anchor.ChargingDurationSeconds is null) return 0;

        var startSec = (anchor.AtUtc - anchor.ChargingStartedAtUtc.Value).TotalSeconds;
        var endSec = startSec + elapsedSimSeconds;
        var kwSeconds = IntegrateProfileKwSeconds(startSec, endSec, anchor.ChargingDurationSeconds.Value);
        return (long)Math.Round(kwSeconds * 1000.0 / 3600.0);
    }

    /// <summary>
    /// Instantaneous power at <paramref name="t"/> sim-seconds into the
    /// Charging state, given total <paramref name="totalDuration"/> in
    /// sim-seconds. Public for direct test invocation.
    /// </summary>
    public double ProfileKw(double t, double totalDuration)
    {
        if (t < 0 || t > totalDuration) return 0;

        var peak = _opts.PeakKw;
        var ramp = _opts.RampSeconds;
        var trickle = _opts.TrickleSeconds;
        var taperFraction = _opts.TaperFraction;
        var taperEnd = _opts.TaperEndKw;

        var taperStart = totalDuration * (1 - taperFraction);
        var trickleStart = totalDuration - trickle;

        // 1. Ramp 0 → peak (linear).
        if (t < ramp) return peak * (t / Math.Max(1.0, ramp));

        // 2. Plateau with jitter.
        if (t < taperStart)
        {
            return peak + Jitter(t) * _opts.JitterAmplitudeKw;
        }

        // 3. Taper peak → taperEnd (ease-out-quadratic — fast drop, leveling).
        if (t < trickleStart)
        {
            var span = Math.Max(1.0, trickleStart - taperStart);
            var progress = (t - taperStart) / span;
            var eased = 1 - (1 - progress) * (1 - progress);
            return peak + (taperEnd - peak) * eased;
        }

        // 4. Trickle taperEnd → 0 (linear).
        var trickleProgress = (t - trickleStart) / Math.Max(1.0, trickle);
        return Math.Max(0, taperEnd * (1 - trickleProgress));
    }

    private static double Jitter(double t) =>
        Math.Sin(t * 0.07) * 0.5 + Math.Sin(t * 0.013) * 0.3 + Math.Sin(t * 0.19) * 0.2;

    /// <summary>
    /// Integrate the power profile from <paramref name="startSec"/> to
    /// <paramref name="endSec"/> using trapezoidal rule. Returns kW-seconds.
    /// </summary>
    public double IntegrateProfileKwSeconds(double startSec, double endSec, double totalDuration, int steps = 50)
    {
        if (endSec <= startSec) return 0;
        var stepSize = (endSec - startSec) / steps;
        var total = 0.0;
        for (var i = 0; i < steps; i++)
        {
            var t1 = startSec + i * stepSize;
            var t2 = t1 + stepSize;
            total += (ProfileKw(t1, totalDuration) + ProfileKw(t2, totalDuration)) / 2 * stepSize;
        }
        return total;
    }

    private double StateDurationSeconds(SimState state) => state switch
    {
        SimState.Plugged => _opts.PluggedHandshakeSeconds,
        SimState.Charging => _anchor.ChargingDurationSeconds ?? _opts.ChargingDurationSeconds,
        SimState.SessionComplete => _opts.SessionCompleteSeconds,
        _ => double.PositiveInfinity,
    };

    private static bool IsVehicleConnected(SimState s) =>
        s is SimState.Plugged or SimState.Charging or SimState.SessionComplete;

    private static bool IsContactorClosed(SimState s) => s is SimState.Charging;

    private record AnchorPoint(
        SimState State,
        DateTime AtUtc,
        long LifetimeWh,
        long SessionWh,
        int ContactorCycles,
        int ConnectorCycles,
        int ChargeStarts,
        long ChargingTimeS,
        DateTime? SessionStartedAtUtc,
        DateTime? ChargingStartedAtUtc,
        double? ChargingDurationSeconds);
}
