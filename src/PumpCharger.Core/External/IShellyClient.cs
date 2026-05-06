using PumpCharger.Core.External.Models;

namespace PumpCharger.Core.External;

public interface IShellyClient
{
    bool IsConfigured { get; }
    Task<ShellyEmStatus> GetEmStatusAsync(CancellationToken cancellationToken = default);
    Task<ShellyEmDataStatus> GetEmDataStatusAsync(CancellationToken cancellationToken = default);
}
