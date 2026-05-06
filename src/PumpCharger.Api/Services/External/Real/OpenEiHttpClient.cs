using PumpCharger.Api.Config;
using PumpCharger.Core.External;
using PumpCharger.Core.External.Models;

namespace PumpCharger.Api.Services.External.Real;

public class OpenEiHttpClient : IOpenEiClient
{
    private readonly OpenEiOptions _opts;

    public OpenEiHttpClient(OpenEiOptions opts)
    {
        _opts = opts;
    }

    public bool IsConfigured => !string.IsNullOrWhiteSpace(_opts.ApiKey)
        && !_opts.ApiKey.StartsWith("REPLACE_WITH", StringComparison.OrdinalIgnoreCase);

    public Task<IReadOnlyList<OpenEiSchedule>> SearchSchedulesAsync(
        string utilityName,
        CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Real OpenEI client lands in phase 10.");

    public Task<OpenEiRate?> PullRateAsync(string scheduleId, CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Real OpenEI client lands in phase 10.");
}
