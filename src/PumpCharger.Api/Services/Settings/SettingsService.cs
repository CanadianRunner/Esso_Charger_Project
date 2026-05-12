using System.Globalization;
using Microsoft.EntityFrameworkCore;
using PumpCharger.Api.Data;
using PumpCharger.Core.Entities;
using PumpCharger.Core.Settings;

namespace PumpCharger.Api.Services.Settings;

public class SettingsService : ISettingsService
{
    private readonly AppDbContext _db;

    public SettingsService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<string?> GetAsync(string key, CancellationToken ct = default)
    {
        var s = await _db.Settings.AsNoTracking().FirstOrDefaultAsync(x => x.Key == key, ct);
        return s?.Value;
    }

    public async Task<int> GetIntAsync(string key, int defaultValue, CancellationToken ct = default)
    {
        var raw = await GetAsync(key, ct);
        return int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v) ? v : defaultValue;
    }

    public async Task<long> GetLongAsync(string key, long defaultValue, CancellationToken ct = default)
    {
        var raw = await GetAsync(key, ct);
        return long.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v) ? v : defaultValue;
    }

    public async Task<decimal> GetDecimalAsync(string key, decimal defaultValue, CancellationToken ct = default)
    {
        var raw = await GetAsync(key, ct);
        return decimal.TryParse(raw, NumberStyles.Number, CultureInfo.InvariantCulture, out var v) ? v : defaultValue;
    }

    public async Task SetAsync(string key, string value, string actor = "system", CancellationToken ct = default)
    {
        var existing = await _db.Settings.FirstOrDefaultAsync(x => x.Key == key, ct);
        if (existing is null)
        {
            _db.Settings.Add(new Setting { Key = key, Value = value, UpdatedAt = DateTime.UtcNow });
        }
        else
        {
            existing.Value = value;
            existing.UpdatedAt = DateTime.UtcNow;
        }

        _db.AuditLogs.Add(new AuditLog
        {
            Timestamp = DateTime.UtcNow,
            Actor = actor,
            Action = "settings.update",
            Details = $"{{\"key\":\"{key}\",\"value\":\"{Escape(value)}\"}}"
        });

        await _db.SaveChangesAsync(ct);
    }

    public async Task SetIfMissingAsync(string key, string value, CancellationToken ct = default)
    {
        var existing = await _db.Settings.AsNoTracking().AnyAsync(x => x.Key == key, ct);
        if (existing) return;
        await SetAsync(key, value, actor: "system", ct);
    }

    public async Task SeedDefaultsAsync(CancellationToken ct = default)
    {
        await SetIfMissingAsync(SettingKeys.RateSource, RateSourceValues.Manual, ct);
        await SetIfMissingAsync(SettingKeys.RateFlatCentsPerKwh, "13", ct);
        await SetIfMissingAsync(SettingKeys.SessionMergeGraceSeconds, "60", ct);
        await SetIfMissingAsync(SettingKeys.SessionIdleThresholdAmps, "0.5", ct);
        await SetIfMissingAsync(SettingKeys.LifetimeOffsetWh, "0", ct);
        await SetIfMissingAsync(SettingKeys.DisplayMiniRotationSeconds, "10", ct);
        await SetIfMissingAsync(SettingKeys.DisplayPostSessionBrightSeconds, "300", ct);
        await SetIfMissingAsync(SettingKeys.DisplayPostSessionDimSeconds, "600", ct);
    }

    private static string Escape(string v) => v.Replace("\\", "\\\\").Replace("\"", "\\\"");
}
