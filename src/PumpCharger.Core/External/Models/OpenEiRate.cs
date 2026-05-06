namespace PumpCharger.Core.External.Models;

public record OpenEiRate
{
    public string ScheduleId { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Utility { get; init; } = string.Empty;
    public int FlatRateCentsPerKwh { get; init; }
    public DateTime PulledAt { get; init; }
}

public record OpenEiSchedule
{
    public string Id { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Utility { get; init; } = string.Empty;
    public string Sector { get; init; } = string.Empty;
}
