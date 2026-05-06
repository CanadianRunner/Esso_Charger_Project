using PumpCharger.Api.Config;

namespace PumpCharger.Api.Services.External.Fake;

public class FakeHpwcSimulator
{
    private readonly FakeHpwcOptions _opts;
    private readonly Func<DateTime> _clock;
    private readonly DateTime _simStartedAtUtc;
    private readonly object _lock = new();

    private AnchorPoint _anchor;
    private DateTime? _networkFailureUntilUtc;

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
            SessionStartedAtUtc: null);
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

    public SimSnapshot PlugIn() => Jump(SimState.Plugged);
    public SimSnapshot Unplug() => Jump(SimState.Idle);
    public SimSnapshot StartCharging() => Jump(SimState.Charging);
    public SimSnapshot StopCharging() => Jump(SimState.SessionComplete);
    public SimSnapshot TriggerCyclingPause() => Jump(SimState.CyclingPause);

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

            _anchor = _anchor with
            {
                State = target,
                AtUtc = now,
                SessionStartedAtUtc = sessionStart,
                SessionWh = sessionWh,
                ContactorCycles = contactorCycles,
                ConnectorCycles = connectorCycles,
                ChargeStarts = chargeStarts
            };

            return BuildSnapshot();
        }
    }

    private void AdvanceToNow()
    {
        const int maxIterations = 10_000;
        for (var i = 0; i < maxIterations; i++)
        {
            var elapsedReal = (_clock() - _anchor.AtUtc).TotalSeconds;
            if (elapsedReal <= 0) return;
            var elapsedSim = elapsedReal * _opts.TimeAcceleration;
            var duration = StateDurationSeconds(_anchor.State);
            if (elapsedSim < duration) return;

            var realConsumed = duration / _opts.TimeAcceleration;
            var newAnchorAt = _anchor.AtUtc.AddSeconds(realConsumed);
            _anchor = NaturalTransition(_anchor, newAnchorAt, duration);
        }
    }

    private void CommitPartial()
    {
        var now = _clock();
        var elapsedReal = (now - _anchor.AtUtc).TotalSeconds;
        if (elapsedReal <= 0) return;
        var elapsedSim = elapsedReal * _opts.TimeAcceleration;

        var addedWh = IsChargingState(_anchor.State) ? ChargingWh(elapsedSim) : 0;
        var addedChargingTime = IsChargingState(_anchor.State) ? (long)elapsedSim : 0;

        _anchor = _anchor with
        {
            AtUtc = now,
            LifetimeWh = _anchor.LifetimeWh + addedWh,
            SessionWh = _anchor.SessionWh + addedWh,
            ChargingTimeS = _anchor.ChargingTimeS + addedChargingTime
        };
    }

    private AnchorPoint NaturalTransition(AnchorPoint prev, DateTime at, double simSecondsConsumed)
    {
        var lifetimeWh = prev.LifetimeWh;
        var sessionWh = prev.SessionWh;
        var chargingTimeS = prev.ChargingTimeS;
        var sessionStart = prev.SessionStartedAtUtc;
        var contactorCycles = prev.ContactorCycles;
        var connectorCycles = prev.ConnectorCycles;
        var chargeStarts = prev.ChargeStarts;

        if (IsChargingState(prev.State))
        {
            var wh = ChargingWh(simSecondsConsumed);
            lifetimeWh += wh;
            sessionWh += wh;
            chargingTimeS += (long)simSecondsConsumed;
        }

        var next = prev.State switch
        {
            SimState.Idle => SimState.Plugged,
            SimState.Plugged => SimState.Charging,
            SimState.Charging => SimState.CyclingPause,
            SimState.CyclingPause => SimState.ChargingResumed,
            SimState.ChargingResumed => SimState.SessionComplete,
            SimState.SessionComplete => SimState.Idle,
            _ => throw new InvalidOperationException($"Unknown state {prev.State}")
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
            ChargeStarts = chargeStarts
        };
    }

    private SimSnapshot BuildSnapshot()
    {
        var now = _clock();
        var elapsedReal = Math.Max(0, (now - _anchor.AtUtc).TotalSeconds);
        var elapsedSim = elapsedReal * _opts.TimeAcceleration;

        var liveKw = IsChargingState(_anchor.State) ? _opts.ChargeKw : 0.0;
        var addedWh = IsChargingState(_anchor.State) ? ChargingWh(elapsedSim) : 0;
        var addedChargingTime = IsChargingState(_anchor.State) ? (long)elapsedSim : 0;

        var sessionElapsed = _anchor.SessionStartedAtUtc is { } start
            ? (int)Math.Max(0, (now - start).TotalSeconds * _opts.TimeAcceleration)
            : 0;

        var uptimeS = (long)((now - _simStartedAtUtc).TotalSeconds * _opts.TimeAcceleration);

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
            UptimeS = uptimeS
        };
    }

    private long ChargingWh(double simSeconds) =>
        (long)Math.Round(simSeconds * _opts.ChargeKw * 1000.0 / 3600.0);

    private double StateDurationSeconds(SimState state) => state switch
    {
        SimState.Idle => _opts.IdleSeconds,
        SimState.Plugged => _opts.PluggedHandshakeSeconds,
        SimState.Charging => _opts.FirstChargeSeconds,
        SimState.CyclingPause => _opts.CyclingPauseSeconds,
        SimState.ChargingResumed => _opts.SecondChargeSeconds,
        SimState.SessionComplete => _opts.SessionCompleteSeconds,
        _ => throw new ArgumentOutOfRangeException(nameof(state))
    };

    private static bool IsVehicleConnected(SimState s) =>
        s is SimState.Plugged or SimState.Charging or SimState.CyclingPause
        or SimState.ChargingResumed or SimState.SessionComplete;

    private static bool IsContactorClosed(SimState s) =>
        s is SimState.Charging or SimState.ChargingResumed;

    private static bool IsChargingState(SimState s) =>
        s is SimState.Charging or SimState.ChargingResumed;

    private record AnchorPoint(
        SimState State,
        DateTime AtUtc,
        long LifetimeWh,
        long SessionWh,
        int ContactorCycles,
        int ConnectorCycles,
        int ChargeStarts,
        long ChargingTimeS,
        DateTime? SessionStartedAtUtc);
}
