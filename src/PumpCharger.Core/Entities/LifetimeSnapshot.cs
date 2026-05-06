namespace PumpCharger.Core.Entities;

public class LifetimeSnapshot
{
    public long Id { get; set; }
    public DateTime RecordedAt { get; set; }
    public long HpwcLifetimeWh { get; set; }
    public long ComputedLifetimeWh { get; set; }
    public long DriftWh { get; set; }
}
