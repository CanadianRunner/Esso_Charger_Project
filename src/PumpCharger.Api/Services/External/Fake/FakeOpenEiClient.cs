using PumpCharger.Core.External;
using PumpCharger.Core.External.Models;

namespace PumpCharger.Api.Services.External.Fake;

public class FakeOpenEiClient : IOpenEiClient
{
    private static readonly IReadOnlyList<OpenEiSchedule> CannedSchedules = new[]
    {
        new OpenEiSchedule
        {
            Id = "fake-pge-7",
            Name = "Schedule 7 - Residential Service",
            Utility = "Portland General Electric",
            Sector = "Residential"
        },
        new OpenEiSchedule
        {
            Id = "fake-pge-15",
            Name = "Schedule 15 - Time of Day",
            Utility = "Portland General Electric",
            Sector = "Residential"
        }
    };

    public bool IsConfigured => true;

    public Task<IReadOnlyList<OpenEiSchedule>> SearchSchedulesAsync(
        string utilityName,
        CancellationToken cancellationToken = default)
    {
        var matches = CannedSchedules
            .Where(s => s.Utility.Contains(utilityName, StringComparison.OrdinalIgnoreCase))
            .ToList();
        return Task.FromResult<IReadOnlyList<OpenEiSchedule>>(matches);
    }

    public Task<OpenEiRate?> PullRateAsync(string scheduleId, CancellationToken cancellationToken = default)
    {
        var schedule = CannedSchedules.FirstOrDefault(s => s.Id == scheduleId);
        if (schedule is null) return Task.FromResult<OpenEiRate?>(null);

        return Task.FromResult<OpenEiRate?>(new OpenEiRate
        {
            ScheduleId = schedule.Id,
            Name = schedule.Name,
            Utility = schedule.Utility,
            FlatRateCentsPerKwh = 13,
            PulledAt = DateTime.UtcNow
        });
    }
}
