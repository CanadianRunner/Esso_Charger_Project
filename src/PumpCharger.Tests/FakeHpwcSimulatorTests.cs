using PumpCharger.Api.Config;
using PumpCharger.Api.Services.External.Fake;

namespace PumpCharger.Tests;

public class FakeHpwcSimulatorTests
{
    private readonly FakeHpwcOptions _opts = new()
    {
        TimeAcceleration = 1.0,
        InitialLifetimeWh = 1_000_000,
        ChargeKw = 10.0,
        IdleSeconds = 30,
        PluggedHandshakeSeconds = 5,
        FirstChargeSeconds = 300,
        CyclingPauseSeconds = 30,
        SecondChargeSeconds = 60,
        SessionCompleteSeconds = 15
    };

    private readonly DateTime _t0 = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private (FakeHpwcSimulator sim, Action<TimeSpan> advance) Build(double accel = 1.0)
    {
        _opts.TimeAcceleration = accel;
        var now = _t0;
        var sim = new FakeHpwcSimulator(_opts, () => now);
        return (sim, span => now = now + span);
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
        Assert.Equal(0, snap.SessionWh);
    }

    [Fact]
    public void Auto_transitions_idle_to_plugged_after_idle_duration()
    {
        var (sim, advance) = Build();
        advance(TimeSpan.FromSeconds(_opts.IdleSeconds + 1));
        var snap = sim.CurrentSnapshot();

        Assert.Equal(SimState.Plugged, snap.State);
        Assert.True(snap.VehicleConnected);
        Assert.False(snap.ContactorClosed);
        Assert.Equal(1, snap.ConnectorCycles);
    }

    [Fact]
    public void Auto_transitions_through_to_charging_and_accumulates_energy()
    {
        var (sim, advance) = Build();
        // idle 30 + plugged 5 + 60s into charging
        advance(TimeSpan.FromSeconds(30 + 5 + 60));
        var snap = sim.CurrentSnapshot();

        Assert.Equal(SimState.Charging, snap.State);
        Assert.True(snap.VehicleConnected);
        Assert.True(snap.ContactorClosed);
        Assert.Equal(10.0, snap.LiveKw);

        // 60 sim seconds at 10kW = 60 * 10000 / 3600 = 166.67 Wh
        var expectedSessionWh = (long)Math.Round(60 * 10_000.0 / 3600);
        Assert.Equal(expectedSessionWh, snap.SessionWh);
        Assert.Equal(_opts.InitialLifetimeWh + expectedSessionWh, snap.LifetimeWh);
        Assert.Equal(1, snap.ContactorCycles);
        Assert.Equal(1, snap.ChargeStarts);
    }

    [Fact]
    public void CyclingPause_does_not_accumulate_energy_but_keeps_vehicle_connected()
    {
        var (sim, advance) = Build();
        // walk to mid-pause: idle + plugged + full first charge + 10s into pause
        advance(TimeSpan.FromSeconds(30 + 5 + 300 + 10));
        var snap = sim.CurrentSnapshot();

        Assert.Equal(SimState.CyclingPause, snap.State);
        Assert.True(snap.VehicleConnected);
        Assert.False(snap.ContactorClosed);
        Assert.Equal(0, snap.LiveKw);

        // session should hold full first-charge energy (300s @ 10kW = 833.33 Wh)
        var expected = (long)Math.Round(300 * 10_000.0 / 3600);
        Assert.Equal(expected, snap.SessionWh);
    }

    [Fact]
    public void Resumed_charge_increments_contactor_cycles_and_continues_session()
    {
        var (sim, advance) = Build();
        // walk into resumed charge: idle + plugged + charge1 + pause + 5s into resumed
        advance(TimeSpan.FromSeconds(30 + 5 + 300 + 30 + 5));
        var snap = sim.CurrentSnapshot();

        Assert.Equal(SimState.ChargingResumed, snap.State);
        Assert.True(snap.ContactorClosed);
        Assert.Equal(2, snap.ContactorCycles);  // closed once for Charging, once for ChargingResumed
        Assert.Equal(2, snap.ChargeStarts);
        Assert.Equal(1, snap.ConnectorCycles);  // only one plug-in this session
    }

    [Fact]
    public void SessionComplete_keeps_session_energy_for_display_then_unplug_resets()
    {
        var (sim, advance) = Build();
        // walk to session complete: idle + plugged + charge1 + pause + charge2 + 5s into complete
        advance(TimeSpan.FromSeconds(30 + 5 + 300 + 30 + 60 + 5));
        var snapComplete = sim.CurrentSnapshot();

        Assert.Equal(SimState.SessionComplete, snapComplete.State);
        Assert.True(snapComplete.VehicleConnected);
        Assert.False(snapComplete.ContactorClosed);
        Assert.True(snapComplete.SessionWh > 0);

        // walk through complete (15s) and into next idle
        advance(TimeSpan.FromSeconds(15 + 1));
        var snapIdle = sim.CurrentSnapshot();

        Assert.Equal(SimState.Idle, snapIdle.State);
        Assert.False(snapIdle.VehicleConnected);
        Assert.Equal(0, snapIdle.SessionWh);
        Assert.True(snapIdle.LifetimeWh > _opts.InitialLifetimeWh);
    }

    [Fact]
    public void Cycle_returns_to_idle_after_one_full_pass()
    {
        var (sim, advance) = Build();
        // full cycle = 30 + 5 + 300 + 30 + 60 + 15 = 440s, then back to idle
        advance(TimeSpan.FromSeconds(441));
        var snap = sim.CurrentSnapshot();
        Assert.Equal(SimState.Idle, snap.State);
    }

    [Fact]
    public void Time_acceleration_speeds_up_state_machine()
    {
        var (sim, advance) = Build(accel: 10.0);
        // 3.2 real seconds = 32 sim seconds → just past Idle (30s) into Plugged
        advance(TimeSpan.FromSeconds(3.2));
        var snap = sim.CurrentSnapshot();

        Assert.Equal(SimState.Plugged, snap.State);
    }

    [Fact]
    public void Manual_PlugIn_jumps_state_and_starts_session()
    {
        var (sim, _) = Build();
        var snap = sim.PlugIn();

        Assert.Equal(SimState.Plugged, snap.State);
        Assert.True(snap.VehicleConnected);
        Assert.Equal(1, snap.ConnectorCycles);
    }

    [Fact]
    public void Manual_StartCharging_increments_contactor_cycles_from_idle()
    {
        var (sim, _) = Build();
        sim.PlugIn();
        var snap = sim.StartCharging();

        Assert.Equal(SimState.Charging, snap.State);
        Assert.True(snap.ContactorClosed);
        Assert.Equal(1, snap.ContactorCycles);
        Assert.Equal(1, snap.ChargeStarts);
    }

    [Fact]
    public void Manual_Unplug_resets_session_but_keeps_lifetime()
    {
        var (sim, advance) = Build();
        sim.StartCharging();
        advance(TimeSpan.FromSeconds(30));  // 30 sim seconds of charging

        var snapMid = sim.CurrentSnapshot();
        Assert.True(snapMid.SessionWh > 0);
        var lifetimeBefore = snapMid.LifetimeWh;

        var snapAfter = sim.Unplug();

        Assert.Equal(SimState.Idle, snapAfter.State);
        Assert.False(snapAfter.VehicleConnected);
        Assert.Equal(0, snapAfter.SessionWh);
        Assert.True(snapAfter.LifetimeWh >= lifetimeBefore);
    }

    [Fact]
    public void Manual_TriggerCyclingPause_from_charging_opens_contactor()
    {
        var (sim, _) = Build();
        sim.StartCharging();
        var snap = sim.TriggerCyclingPause();

        Assert.Equal(SimState.CyclingPause, snap.State);
        Assert.False(snap.ContactorClosed);
    }

    [Fact]
    public void Manual_StopCharging_lands_in_session_complete()
    {
        var (sim, advance) = Build();
        sim.StartCharging();
        advance(TimeSpan.FromSeconds(60));
        var snap = sim.StopCharging();

        Assert.Equal(SimState.SessionComplete, snap.State);
        Assert.False(snap.ContactorClosed);
        Assert.True(snap.VehicleConnected);
        Assert.True(snap.SessionWh > 0);
    }

    [Fact]
    public void Network_failure_window_is_observable()
    {
        var (sim, advance) = Build();
        Assert.False(sim.IsNetworkFailing);

        sim.SimulateNetworkFailure(TimeSpan.FromSeconds(30));
        Assert.True(sim.IsNetworkFailing);

        advance(TimeSpan.FromSeconds(31));
        Assert.False(sim.IsNetworkFailing);
    }

    [Fact]
    public void AdvanceToNow_handles_many_natural_cycles_without_diverging()
    {
        var (sim, advance) = Build(accel: 100.0);
        // 100 real seconds × 100 accel = 10,000 sim seconds = ~22 full 440s cycles
        advance(TimeSpan.FromSeconds(100));
        var snap = sim.CurrentSnapshot();

        // we don't care exactly which state — just that we got there sanely
        Assert.True(snap.LifetimeWh > _opts.InitialLifetimeWh);
        Assert.True(snap.ConnectorCycles > 1);
        Assert.True(snap.ContactorCycles > 1);
    }
}
