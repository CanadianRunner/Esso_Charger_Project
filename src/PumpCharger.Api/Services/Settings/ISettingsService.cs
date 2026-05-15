namespace PumpCharger.Api.Services.Settings;

public interface ISettingsService
{
    Task<string?> GetAsync(string key, CancellationToken ct = default);
    Task<int> GetIntAsync(string key, int defaultValue, CancellationToken ct = default);
    Task<long> GetLongAsync(string key, long defaultValue, CancellationToken ct = default);
    Task<decimal> GetDecimalAsync(string key, decimal defaultValue, CancellationToken ct = default);

    /// <summary>
    /// Write a setting and append a `settings.update` audit log entry. The
    /// entry includes both the previous and new values plus an optional
    /// reason — used by high-consequence keys (e.g. lifetime.offset_wh)
    /// where future debugging benefits from a written explanation.
    /// </summary>
    Task SetAsync(string key, string value, string actor = "system", string? reason = null, CancellationToken ct = default);
    Task SetIfMissingAsync(string key, string value, CancellationToken ct = default);

    Task SeedDefaultsAsync(CancellationToken ct = default);
}
