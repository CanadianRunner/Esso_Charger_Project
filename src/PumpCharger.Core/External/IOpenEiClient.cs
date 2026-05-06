using PumpCharger.Core.External.Models;

namespace PumpCharger.Core.External;

public interface IOpenEiClient
{
    bool IsConfigured { get; }
    Task<IReadOnlyList<OpenEiSchedule>> SearchSchedulesAsync(string utilityName, CancellationToken cancellationToken = default);
    Task<OpenEiRate?> PullRateAsync(string scheduleId, CancellationToken cancellationToken = default);
}
