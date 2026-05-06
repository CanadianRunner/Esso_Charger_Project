namespace PumpCharger.Core.External.Models;

public record ShellyEmStatus
{
    public double TotalActPower { get; init; }
    public double TotalAprtPower { get; init; }
    public double AVoltage { get; init; }
    public double ACurrent { get; init; }
    public double AActPower { get; init; }
    public double AAprtPower { get; init; }
    public double APf { get; init; }
    public double BVoltage { get; init; }
    public double BCurrent { get; init; }
    public double BActPower { get; init; }
    public double BAprtPower { get; init; }
    public double BPf { get; init; }
    public double? NCurrent { get; init; }
}
