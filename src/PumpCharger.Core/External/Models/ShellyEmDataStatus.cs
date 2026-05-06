namespace PumpCharger.Core.External.Models;

public record ShellyEmDataStatus
{
    public double TotalAct { get; init; }
    public double ATotalActEnergy { get; init; }
    public double BTotalActEnergy { get; init; }
}
