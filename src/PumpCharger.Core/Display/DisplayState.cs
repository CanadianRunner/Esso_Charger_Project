namespace PumpCharger.Core.Display;

public enum DisplayState
{
    Idle,
    PluggedNotCharging,
    Charging,
    SessionComplete
}

public static class DisplayStateExtensions
{
    /// <summary>
    /// Wire string used by the frontend SignalR consumer.
    /// Matches the spec's TypeScript union type.
    /// </summary>
    public static string ToWire(this DisplayState state) => state switch
    {
        DisplayState.Idle => "idle",
        DisplayState.PluggedNotCharging => "plugged_not_charging",
        DisplayState.Charging => "charging",
        DisplayState.SessionComplete => "session_complete",
        _ => "idle"
    };
}
