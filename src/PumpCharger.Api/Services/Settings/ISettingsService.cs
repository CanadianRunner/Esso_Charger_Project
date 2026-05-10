namespace PumpCharger.Api.Services.Settings;

public interface ISettingsService
{
    Task<string?> GetAsync(string key, CancellationToken ct = default);
    Task<int> GetIntAsync(string key, int defaultValue, CancellationToken ct = default);
    Task<long> GetLongAsync(string key, long defaultValue, CancellationToken ct = default);
    Task<decimal> GetDecimalAsync(string key, decimal defaultValue, CancellationToken ct = default);

    Task SetAsync(string key, string value, string actor = "system", CancellationToken ct = default);
    Task SetIfMissingAsync(string key, string value, CancellationToken ct = default);

    Task SeedDefaultsAsync(CancellationToken ct = default);
}
