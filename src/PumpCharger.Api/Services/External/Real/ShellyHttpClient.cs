using PumpCharger.Api.Config;
using PumpCharger.Core.External;
using PumpCharger.Core.External.Models;

namespace PumpCharger.Api.Services.External.Real;

public class ShellyHttpClient : IShellyClient
{
    private readonly ShellyOptions _opts;

    public ShellyHttpClient(ShellyOptions opts)
    {
        _opts = opts;
    }

    public bool IsConfigured => _opts.Enabled && !string.IsNullOrWhiteSpace(_opts.Host)
        && !_opts.Host.StartsWith("REPLACE_WITH", StringComparison.OrdinalIgnoreCase);

    public Task<ShellyEmStatus> GetEmStatusAsync(CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Real Shelly HTTP client lands in phase 9.");

    public Task<ShellyEmDataStatus> GetEmDataStatusAsync(CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Real Shelly HTTP client lands in phase 9.");
}
