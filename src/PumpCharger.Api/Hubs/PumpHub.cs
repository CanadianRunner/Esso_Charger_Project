using Microsoft.AspNetCore.SignalR;

namespace PumpCharger.Api.Hubs;

/// <summary>
/// Public, no-auth hub for the kiosk pump display. Server is the only sender;
/// clients subscribe via the "pumpState" event.
/// </summary>
public class PumpHub : Hub
{
    public const string PumpStateEvent = "pumpState";
}
