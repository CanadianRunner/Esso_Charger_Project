using PumpCharger.Api.Config;
using PumpCharger.Api.Services.External.Fake;

namespace PumpCharger.Tests;

public class FakeHpwcSimulatorTests
{
    private readonly FakeHpwcOptions _opts = new()
    {
        TimeAcceleration = 1.0,
        InitialLifetimeWh = 1_000_000,
        PeakKw = 10.0,
        TaperEndKw = 1.0,
        JitterAmplitudeKw = 0.3,
        PluggedHandshakeSeconds = 10,
        ChargingDurationSeconds = 600,
        RampSeconds = 30,
        TrickleSeconds = 30,
        TaperFraction = 0.25,
        SessionCompleteSeconds = 30,
    };

    private readonly DateTime _t0 = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private (FakeHpwcSimulator sim, Action<TimeSpan> advance) Build()
    {
        var now = _t0;
        var sim = new FakeHpwcSimulator(_opts, () => now);
        return (sim, span => now += span);
    }

    [Fact]
    public void Starts_idle_with_initial_lifetime()
    {
        var (sim, _) = Build();
        var snap = sim.CurrentSnapshot();

        Assert.Equal(SimState.Idle, snap.State);
        Assert.False(snap.VehicleConnected);
        Assert.False(snap.ContactorClosed);
        Assert.Equal(0, snap.LiveKw);
        Assert.Equal(_opts.InitialLifetimeWh, snap.LifetimeWh);
    }

    [Fact]
    public void Stays_idle_indefinitely_without_an_explicit_plug_in()
    {
        var (sim, advance) = Build();
        advance(TimeSpan.FromHours(2));
        var snap = sim.CurrentSnapshot();

        Assert.Equal(SimState.Idle, snap.State);
        Assert.False(snap.VehicleConnected);
    }

    [Fact]
    public void PlugIn_jumps_to_plugged_and_starts_session()
    {
        var (sim, _) = Build();
        var snap = sim.PlugIn();

        Assert.Equal(SimState.Plugged, snap.State);
        Assert.True(snap.VehicleConnected);
        Assert.False(snap.ContactorClosed);
        Assert.Equal(1, snap.ConnectorCycles);
    }

    [Fact]
    public void Plugged_transitions_to_charging_after_handshake()
    {
        var (sim, advance) = Build();
        sim.PlugIn();
        advance(TimeSpan.FromSeconds(_opts.PluggedHandshakeSeconds + 1));
        var snap = sim.CurrentSnapshot();

        Assert.Equal(SimState.Charging, snap.State);
        Assert.True(snap.ContactorClosed);
        Assert.Equal(1, snap.ContactorCycles);
        Assert.Equal(1, snap.ChargeStarts);
    }

    [Fact]
    public void Charging_state_transitions_through_session_complete_to_idle()
    {
        var (sim, advance) = Build();
        sim.PlugIn();

        var total = _opts.PluggedHandshakeSeconds + _opts.ChargingDurationSeconds + _opts.SessionCompleteSeconds + 1;
        advance(TimeSpan.FromSeconds(total));
        var snap = sim.CurrentSnapshot();

        Assert.Equal(SimState.Idle, snap.State);
        Assert.False(snap.VehicleConnected);
    }

    [Fact]
    public void Idle_persists_after_a_session_completes()
    {
        var (sim, advance) = Build();
        sim.PlugIn();
        advance(TimeSpan.FromSeconds(_opts.PluggedHandshakeSeconds + _opts.ChargingDurationSeconds + _opts.SessionCompleteSeconds + 1));
        Assert.Equal(SimState.Idle, sim.CurrentSnapshot().State);

        advance(TimeSpan.FromHours(1));
        Assert.Equal(SimState.Idle, sim.CurrentSnapshot().State);
    }

    [Fact]
    public void ProfileKw_ramps_linearly_from_zero_to_peak_over_ramp_seconds()
    {
        var (sim, _) = Build();
        Assert.Equal(0, sim.ProfileKw(0, _opts.ChargingDurationSeconds), 3);
        Assert.Equal(_opts.PeakKw / 2, sim.ProfileKw(_opts.RampSeconds / 2.0, _opts.ChargingDurationSeconds), 3);
        // Just before the ramp finishes: still in linear ramp, deterministic peak.
        var nearEnd = sim.ProfileKw(_opts.RampSeconds - 0.001, _opts.ChargingDurationSeconds);
        Assert.InRange(nearEnd, _opts.PeakKw - 0.01, _opts.PeakKw);
    }

    [Fact]
    public void ProfileKw_plateaus_near_peak_during_the_middle_of_the_session()
    {
        var (sim, _) = Build();
        // Middle of the plateau (between ramp end and taper start).
        var plateauMid = (_opts.RampSeconds + _opts.ChargingDurationSeconds * (1 - _opts.TaperFraction)) / 2;
        var kw = sim.ProfileKw(plateauMid, _opts.ChargingDurationSeconds);
        Assert.InRange(kw, _opts.PeakKw - _opts.JitterAmplitudeKw, _opts.PeakKw + _opts.JitterAmplitudeKw);
    }

    [Fact]
    public void ProfileKw_tapers_below_peak_in_the_final_quarter()
    {
        var (sim, _) = Build();
        var taperStart = _opts.ChargingDurationSeconds * (1 - _opts.TaperFraction);
        var taperEnd = _opts.ChargingDurationSeconds - _opts.TrickleSeconds;
        var taperMid = (taperStart + taperEnd) / 2;
        var kw = sim.ProfileKw(taperMid, _opts.ChargingDurationSeconds);
        Assert.True(kw < _opts.PeakKw, $"Expected taper below peak, got {kw}");
        Assert.True(kw > _opts.TaperEndKw, $"Expected taper above trickle floor, got {kw}");
    }

    [Fact]
    public void ProfileKw_drops_to_zero_at_session_end()
    {
        var (sim, _) = Build();
        Assert.Equal(0, sim.ProfileKw(_opts.ChargingDurationSeconds, _opts.ChargingDurationSeconds), 3);
        Assert.Equal(0, sim.ProfileKw(_opts.ChargingDurationSeconds + 100, _opts.ChargingDurationSeconds), 3);
    }

    [Fact]
    public void Energy_accumulates_realistically_below_a_flat_peak_assumption()
    {
        var (sim, advance) = Build();
        sim.PlugIn();
        advance(TimeSpan.FromSeconds(_opts.PluggedHandshakeSeconds + _opts.ChargingDurationSeconds + _opts.SessionCompleteSeconds + 1));
        var snap = sim.CurrentSnapshot();

        var flatPeakKwh = _opts.PeakKw * _opts.ChargingDurationSeconds / 3600.0;
        var actualKwh = snap.LifetimeWh - _opts.InitialLifetimeWh;
        // With ramp + taper + trickle losses, total energy is materially below the
        // flat-peak ceiling. Within a 60-90% band of the flat-peak.
        Assert.InRange(actualKwh / 1000.0, flatPeakKwh * 0.6, flatPeakKwh * 0.95);
    }

    [Fact]
    public void PlugIn_with_duration_override_uses_that_duration_for_this_session()
    {
        var (sim, advance) = Build();
        sim.PlugIn(chargingDurationSeconds: 300);

        // Walk far enough that a default-duration (600s) session would still be
        // charging, but the overridden 300s session has already moved on.
        advance(TimeSpan.FromSeconds(_opts.PluggedHandshakeSeconds + 320));
        var snap = sim.CurrentSnapshot();

        // After 320s of charging on a 300s plan, we should be in SessionComplete or Idle.
        Assert.NotEqual(SimState.Charging, snap.State);
    }

    [Fact]
    public void Unplug_returns_to_idle_and_clears_session()
    {
        var (sim, advance) = Build();
        sim.PlugIn();
        advance(TimeSpan.FromSeconds(_opts.PluggedHandshakeSeconds + 60));
        Assert.Equal(SimState.Charging, sim.CurrentSnapshot().State);

        var snap = sim.Unplug();

        Assert.Equal(SimState.Idle, snap.State);
        Assert.False(snap.VehicleConnected);
        Assert.Equal(0, snap.SessionWh);
    }

    [Fact]
    public void Network_failure_window_is_observable_and_expires()
    {
        var (sim, advance) = Build();
        Assert.False(sim.IsNetworkFailing);

        sim.SimulateNetworkFailure(TimeSpan.FromSeconds(30));
        Assert.True(sim.IsNetworkFailing);

        advance(TimeSpan.FromSeconds(31));
        Assert.False(sim.IsNetworkFailing);
    }
}
