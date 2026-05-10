using PumpCharger.Api.Services.Sessions;
using PumpCharger.Core.External.Models;

namespace PumpCharger.Tests;

public class SessionDetectorTests
{
    private static readonly DateTime T0 = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static HpwcVitals Idle() => new() { VehicleConnected = false, ContactorClosed = false };

    private static HpwcVitals Plugged(double sessionWh = 0) => new()
    {
        VehicleConnected = true,
        ContactorClosed = false,
        SessionEnergyWh = sessionWh
    };

    private static HpwcVitals Charging(double kw, double sessionWh) => new()
    {
        VehicleConnected = true,
        ContactorClosed = true,
        SessionEnergyWh = sessionWh,
        VoltageA = 120,
        VoltageB = 120,
        CurrentAA = kw * 1000 / 240,
        CurrentBA = kw * 1000 / 240
    };

    [Fact]
    public void Idle_vitals_produce_no_event()
    {
        var d = new SessionDetector();
        var ev = d.Process(Idle(), T0);
        Assert.Equal(SessionAction.None, ev.Action);
        Assert.False(d.InSession);
    }

    [Fact]
    public void Vehicle_plug_in_opens_session()
    {
        var d = new SessionDetector();
        var ev = d.Process(Plugged(), T0);
        Assert.Equal(SessionAction.Open, ev.Action);
        Assert.Equal(T0, ev.AtUtc);
        Assert.True(d.InSession);
    }

    [Fact]
    public void Vehicle_unplug_closes_session_with_energy_and_peak()
    {
        var d = new SessionDetector();
        d.Process(Plugged(), T0);
        d.Process(Charging(kw: 8.5, sessionWh: 500), T0.AddSeconds(60));
        d.Process(Charging(kw: 11.0, sessionWh: 1500), T0.AddSeconds(120));
        var close = d.Process(Idle(), T0.AddSeconds(180));

        Assert.Equal(SessionAction.Close, close.Action);
        Assert.Equal(1500, close.SessionEnergyWh);
        Assert.Equal(11.0m, close.PeakKw);
        Assert.False(d.InSession);
    }

    [Fact]
    public void Cycling_pause_does_not_close_or_reopen_session()
    {
        var d = new SessionDetector();
        d.Process(Plugged(), T0);
        d.Process(Charging(kw: 10, sessionWh: 1000), T0.AddSeconds(60));

        // Contactor opens (cycling pause) — vehicle still connected.
        var pauseTick = new HpwcVitals
        {
            VehicleConnected = true,
            ContactorClosed = false,
            SessionEnergyWh = 1000
        };
        var ev = d.Process(pauseTick, T0.AddSeconds(90));
        Assert.Equal(SessionAction.None, ev.Action);
        Assert.True(d.InSession);

        // Contactor closes again — still no session boundary.
        ev = d.Process(Charging(kw: 10, sessionWh: 1100), T0.AddSeconds(120));
        Assert.Equal(SessionAction.None, ev.Action);
        Assert.True(d.InSession);

        // Final unplug closes the *single* session.
        var close = d.Process(Idle(), T0.AddSeconds(180));
        Assert.Equal(SessionAction.Close, close.Action);
        Assert.Equal(1100, close.SessionEnergyWh);
    }

    [Fact]
    public void Repeated_plugged_vitals_only_open_once()
    {
        var d = new SessionDetector();
        var first = d.Process(Plugged(), T0);
        var second = d.Process(Plugged(sessionWh: 50), T0.AddSeconds(1));
        var third = d.Process(Charging(kw: 5, sessionWh: 100), T0.AddSeconds(2));

        Assert.Equal(SessionAction.Open, first.Action);
        Assert.Equal(SessionAction.None, second.Action);
        Assert.Equal(SessionAction.None, third.Action);
    }

    [Fact]
    public void After_close_subsequent_plug_opens_a_fresh_session()
    {
        var d = new SessionDetector();
        d.Process(Plugged(), T0);
        d.Process(Charging(kw: 10, sessionWh: 500), T0.AddSeconds(30));
        var close = d.Process(Idle(), T0.AddSeconds(60));
        Assert.Equal(SessionAction.Close, close.Action);

        // The HPWC will reset session_energy_wh on next physical plug-in.
        var open = d.Process(Plugged(sessionWh: 0), T0.AddSeconds(120));
        Assert.Equal(SessionAction.Open, open.Action);
        Assert.Equal(T0.AddSeconds(120), open.AtUtc);

        // Detector state should not carry peak from the prior session.
        Assert.Equal(0m, d.CurrentPeakKw);
    }

    [Fact]
    public void Peak_kw_only_advances_does_not_decrease()
    {
        var d = new SessionDetector();
        d.Process(Plugged(), T0);
        d.Process(Charging(kw: 10, sessionWh: 100), T0.AddSeconds(10));
        d.Process(Charging(kw: 5, sessionWh: 200), T0.AddSeconds(20));
        d.Process(Charging(kw: 8, sessionWh: 300), T0.AddSeconds(30));
        var close = d.Process(Idle(), T0.AddSeconds(40));

        Assert.Equal(10m, close.PeakKw);
    }

    [Fact]
    public void AdoptActiveSession_skips_open_and_resumes_tracking()
    {
        var d = new SessionDetector();
        d.AdoptActiveSession(initialPeakKw: 9.5m, initialSessionWh: 750);

        // First vitals tick after adoption should not emit Open.
        var ev = d.Process(Charging(kw: 10, sessionWh: 800), T0);
        Assert.Equal(SessionAction.None, ev.Action);
        Assert.Equal(10m, d.CurrentPeakKw);  // climbed past adopted peak
        Assert.Equal(800, d.CurrentSessionWh);

        // Unplugging closes the adopted session.
        var close = d.Process(Idle(), T0.AddSeconds(30));
        Assert.Equal(SessionAction.Close, close.Action);
        Assert.Equal(800, close.SessionEnergyWh);
        Assert.Equal(10m, close.PeakKw);
    }

    [Fact]
    public void Adopted_session_keeps_higher_peak_when_initial_already_above_live()
    {
        var d = new SessionDetector();
        d.AdoptActiveSession(initialPeakKw: 11.0m);

        d.Process(Charging(kw: 8, sessionWh: 100), T0);
        var close = d.Process(Idle(), T0.AddSeconds(30));

        Assert.Equal(11.0m, close.PeakKw);
    }
}
