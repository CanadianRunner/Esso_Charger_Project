namespace PumpCharger.Core.Entities;

public class Session
{
    public Guid Id { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public long EnergyWh { get; set; }
    public int RateAtStartCentsPerKwh { get; set; }
    public long CostCents { get; set; }
    public decimal PeakKw { get; set; }
    public long DurationSeconds { get; set; }
    public bool IsMerged { get; set; }
    public string? Notes { get; set; }
    public string? PowerSamplesJson { get; set; }
}
