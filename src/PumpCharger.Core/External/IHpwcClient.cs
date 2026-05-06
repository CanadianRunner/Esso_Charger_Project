using PumpCharger.Core.External.Models;

namespace PumpCharger.Core.External;

public interface IHpwcClient
{
    Task<HpwcVitals> GetVitalsAsync(CancellationToken cancellationToken = default);
    Task<HpwcLifetime> GetLifetimeAsync(CancellationToken cancellationToken = default);
    Task<HpwcVersion> GetVersionAsync(CancellationToken cancellationToken = default);
    Task<HpwcWifiStatus> GetWifiStatusAsync(CancellationToken cancellationToken = default);
}
