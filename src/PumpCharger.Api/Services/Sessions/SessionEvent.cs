namespace PumpCharger.Api.Services.Sessions;

public enum SessionAction
{
    None,
    Open,
    Close
}

public record SessionEvent(
    SessionAction Action,
    DateTime AtUtc,
    long? SessionEnergyWh = null,
    decimal? PeakKw = null);
