namespace PumpCharger.Core.Entities;

public class RateHistory
{
    public long Id { get; set; }
    public DateTime EffectiveFrom { get; set; }
    public DateTime? EffectiveUntil { get; set; }
    public int CentsPerKwh { get; set; }
    public RateSource Source { get; set; }
    public string? OpenEiScheduleId { get; set; }
    public string? Notes { get; set; }
}
