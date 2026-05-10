using PumpCharger.Core.Display;
using PumpCharger.Core.External.Models;

namespace PumpCharger.Api.Services.Display;

public static class DisplayStateRules
{
    /// <summary>
    /// Derives the four-state display state machine from live vitals.
    /// Per the spec table: SessionComplete is "vehicle connected, contactor open,
    /// session had energy" — which technically also matches a cycling pause.
    /// We accept that for now and revisit if it looks wrong on the physical pump.
    /// </summary>
    public static DisplayState From(HpwcVitals vitals, decimal idleThresholdAmps = 0.5m)
    {
        if (!vitals.VehicleConnected) return DisplayState.Idle;

        var current = (decimal)Math.Max(vitals.CurrentAA, vitals.CurrentBA);
        if (vitals.ContactorClosed && current > idleThresholdAmps)
            return DisplayState.Charging;

        return vitals.SessionEnergyWh > 0
            ? DisplayState.SessionComplete
            : DisplayState.PluggedNotCharging;
    }
}
