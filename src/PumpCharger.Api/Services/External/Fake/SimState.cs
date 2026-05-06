namespace PumpCharger.Api.Services.External.Fake;

public enum SimState
{
    Idle,
    Plugged,
    Charging,
    CyclingPause,
    ChargingResumed,
    SessionComplete
}
