namespace PumpCharger.Api.Services.External.Fake;

public record SimSnapshot
{
    public required SimState State { get; init; }
    public required DateTime AsOfUtc { get; init; }
    public required bool VehicleConnected { get; init; }
    public required bool ContactorClosed { get; init; }
    public required double LiveKw { get; init; }
    public required long LifetimeWh { get; init; }
    public required long SessionWh { get; init; }
    public required int SessionElapsedSeconds { get; init; }
    public required int ContactorCycles { get; init; }
    public required int ConnectorCycles { get; init; }
    public required int ChargeStarts { get; init; }
    public required long ChargingTimeS { get; init; }
    public required long UptimeS { get; init; }
}
