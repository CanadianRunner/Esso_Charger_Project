namespace PumpCharger.Core.External.Models;

public record HpwcLifetime
{
    public int ContactorCycles { get; init; }
    public int ContactorCyclesLoaded { get; init; }
    public int AlertCount { get; init; }
    public int ThermalFoldbacks { get; init; }
    public double AvgStartupTemp { get; init; }
    public int ChargeStarts { get; init; }
    public long EnergyWh { get; init; }
    public int ConnectorCycles { get; init; }
    public long UptimeS { get; init; }
    public long ChargingTimeS { get; init; }
}
