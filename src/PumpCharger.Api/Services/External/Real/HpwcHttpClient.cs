using PumpCharger.Core.External;
using PumpCharger.Core.External.Models;

namespace PumpCharger.Api.Services.External.Real;

public class HpwcHttpClient : IHpwcClient
{
    public Task<HpwcVitals> GetVitalsAsync(CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Real HPWC HTTP client lands in phase 8.");

    public Task<HpwcLifetime> GetLifetimeAsync(CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Real HPWC HTTP client lands in phase 8.");

    public Task<HpwcVersion> GetVersionAsync(CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Real HPWC HTTP client lands in phase 8.");

    public Task<HpwcWifiStatus> GetWifiStatusAsync(CancellationToken cancellationToken = default) =>
        throw new NotImplementedException("Real HPWC HTTP client lands in phase 8.");
}
