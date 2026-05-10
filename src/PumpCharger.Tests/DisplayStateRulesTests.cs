using PumpCharger.Api.Services.Display;
using PumpCharger.Core.Display;
using PumpCharger.Core.External.Models;

namespace PumpCharger.Tests;

public class DisplayStateRulesTests
{
    [Fact]
    public void Vehicle_disconnected_is_idle()
    {
        var v = new HpwcVitals { VehicleConnected = false };
        Assert.Equal(DisplayState.Idle, DisplayStateRules.From(v));
    }

    [Fact]
    public void Plugged_no_energy_no_contactor_is_PluggedNotCharging()
    {
        var v = new HpwcVitals
        {
            VehicleConnected = true,
            ContactorClosed = false,
            SessionEnergyWh = 0
        };
        Assert.Equal(DisplayState.PluggedNotCharging, DisplayStateRules.From(v));
    }

    [Fact]
    public void Charging_with_real_current_is_Charging()
    {
        var v = new HpwcVitals
        {
            VehicleConnected = true,
            ContactorClosed = true,
            VoltageA = 120, VoltageB = 120,
            CurrentAA = 41.5, CurrentBA = 41.5,
            SessionEnergyWh = 250
        };
        Assert.Equal(DisplayState.Charging, DisplayStateRules.From(v));
    }

    [Fact]
    public void Contactor_open_with_session_energy_is_SessionComplete()
    {
        var v = new HpwcVitals
        {
            VehicleConnected = true,
            ContactorClosed = false,
            SessionEnergyWh = 1500
        };
        Assert.Equal(DisplayState.SessionComplete, DisplayStateRules.From(v));
    }

    [Fact]
    public void Contactor_closed_but_negligible_current_does_not_count_as_charging()
    {
        var v = new HpwcVitals
        {
            VehicleConnected = true,
            ContactorClosed = true,
            VoltageA = 120, VoltageB = 120,
            CurrentAA = 0.1, CurrentBA = 0.1,
            SessionEnergyWh = 250
        };
        // Below the 0.5A idle threshold — treated as session complete (post-charging idle).
        Assert.Equal(DisplayState.SessionComplete, DisplayStateRules.From(v));
    }

    [Fact]
    public void Wire_strings_match_spec_TypeScript_union()
    {
        Assert.Equal("idle", DisplayState.Idle.ToWire());
        Assert.Equal("plugged_not_charging", DisplayState.PluggedNotCharging.ToWire());
        Assert.Equal("charging", DisplayState.Charging.ToWire());
        Assert.Equal("session_complete", DisplayState.SessionComplete.ToWire());
    }
}
