using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using PumpCharger.Api.Data;
using PumpCharger.Api.Services.Rate;
using PumpCharger.Api.Services.Sessions;
using PumpCharger.Api.Services.Settings;
using PumpCharger.Core.Settings;

namespace PumpCharger.Tests;

public class SessionStoreTests : IDisposable
{
    private readonly SqliteConnection _keepalive;
    private readonly ServiceProvider _provider;
    private readonly SessionStore _store;

    public SessionStoreTests()
    {
        _keepalive = new SqliteConnection("DataSource=:memory:");
        _keepalive.Open();

        var services = new ServiceCollection();
        services.AddDbContext<AppDbContext>(o => o.UseSqlite(_keepalive));
        services.AddScoped<ISettingsService, SettingsService>();
        services.AddScoped<ICurrentRateProvider, SettingsRateProvider>();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());
        services.AddLogging();

        _provider = services.BuildServiceProvider();

        using (var scope = _provider.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
            scope.ServiceProvider.GetRequiredService<ISettingsService>().SeedDefaultsAsync().GetAwaiter().GetResult();
        }

        _store = new SessionStore(
            _provider.GetRequiredService<IServiceScopeFactory>(),
            _provider.GetRequiredService<ILogger<SessionStore>>());
    }

    public void Dispose()
    {
        _provider.Dispose();
        _keepalive.Dispose();
    }

    private async Task<int> SessionCount()
    {
        using var scope = _provider.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().Sessions.CountAsync();
    }

    private async Task SetRate(int cents)
    {
        using var scope = _provider.CreateScope();
        var settings = scope.ServiceProvider.GetRequiredService<ISettingsService>();
        await settings.SetAsync(SettingKeys.RateFlatCentsPerKwh, cents.ToString());
    }

    private async Task SetMergeGrace(int seconds)
    {
        using var scope = _provider.CreateScope();
        var settings = scope.ServiceProvider.GetRequiredService<ISettingsService>();
        await settings.SetAsync(SettingKeys.SessionMergeGraceSeconds, seconds.ToString());
    }

    [Fact]
    public async Task Open_creates_session_with_rate_snapshot()
    {
        await SetRate(17);
        var t0 = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        await _store.OpenAsync(t0);

        Assert.NotNull(_store.ActiveSessionId);
        using var scope = _provider.CreateScope();
        var s = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Sessions.SingleAsync();
        Assert.Equal(t0, s.StartedAt);
        Assert.Null(s.EndedAt);
        Assert.Equal(17, s.RateAtStartCentsPerKwh);
        Assert.False(s.IsMerged);
    }

    [Fact]
    public async Task Close_finalizes_energy_peak_duration_and_cost()
    {
        await SetRate(13);
        var t0 = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        await _store.OpenAsync(t0);
        await _store.CloseAsync(new SessionEvent(SessionAction.Close, t0.AddSeconds(3600), 10_000, 11.5m));

        using var scope = _provider.CreateScope();
        var s = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Sessions.SingleAsync();
        Assert.Equal(t0.AddSeconds(3600), s.EndedAt);
        Assert.Equal(10_000, s.EnergyWh);
        Assert.Equal(11.5m, s.PeakKw);
        Assert.Equal(3600, s.DurationSeconds);
        // 10_000 Wh × 13 cents/kWh / 100_000 = 1.3 cents per Wh × 10_000 Wh ÷ 1000 = 130 cents
        Assert.Equal(130, s.CostCents);
        Assert.Null(_store.ActiveSessionId);
    }

    [Fact]
    public async Task Replug_within_grace_window_merges_sessions()
    {
        await SetRate(13);
        await SetMergeGrace(60);

        var t0 = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        await _store.OpenAsync(t0);
        await _store.CloseAsync(new SessionEvent(SessionAction.Close, t0.AddSeconds(600), 5_000, 10m));

        // 30 seconds later — well inside the 60s grace.
        await _store.OpenAsync(t0.AddSeconds(630));
        await _store.CloseAsync(new SessionEvent(SessionAction.Close, t0.AddSeconds(900), 3_000, 12m));

        Assert.Equal(1, await SessionCount());
        using var scope = _provider.CreateScope();
        var s = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Sessions.SingleAsync();
        Assert.True(s.IsMerged);
        Assert.Equal(t0, s.StartedAt);
        Assert.Equal(t0.AddSeconds(900), s.EndedAt);
        Assert.Equal(8_000, s.EnergyWh);              // 5_000 + 3_000
        Assert.Equal(12m, s.PeakKw);                  // max of 10 and 12
        Assert.Equal(900, s.DurationSeconds);
        Assert.Equal(104, s.CostCents);               // 8000 × 13 / 100_000
    }

    [Fact]
    public async Task Replug_outside_grace_creates_distinct_session()
    {
        await SetMergeGrace(60);
        var t0 = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        await _store.OpenAsync(t0);
        await _store.CloseAsync(new SessionEvent(SessionAction.Close, t0.AddSeconds(600), 5_000, 10m));

        // 90 seconds later — outside grace.
        await _store.OpenAsync(t0.AddSeconds(690));
        await _store.CloseAsync(new SessionEvent(SessionAction.Close, t0.AddSeconds(1000), 2_000, 8m));

        Assert.Equal(2, await SessionCount());
        using var scope = _provider.CreateScope();
        var sessions = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Sessions
            .OrderBy(s => s.StartedAt).ToListAsync();
        Assert.False(sessions[0].IsMerged);
        Assert.False(sessions[1].IsMerged);
        Assert.Equal(5_000, sessions[0].EnergyWh);
        Assert.Equal(2_000, sessions[1].EnergyWh);
    }

    [Fact]
    public async Task Rate_snapshot_does_not_change_when_rate_changes_mid_session()
    {
        await SetRate(13);
        var t0 = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        await _store.OpenAsync(t0);

        // User edits the rate during the session.
        await SetRate(20);

        await _store.CloseAsync(new SessionEvent(SessionAction.Close, t0.AddSeconds(3600), 10_000, 11m));

        using var scope = _provider.CreateScope();
        var s = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Sessions.SingleAsync();
        Assert.Equal(13, s.RateAtStartCentsPerKwh);
        Assert.Equal(130, s.CostCents);
    }

    [Fact]
    public async Task Merge_writes_audit_log_entry()
    {
        await SetMergeGrace(60);
        var t0 = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        await _store.OpenAsync(t0);
        await _store.CloseAsync(new SessionEvent(SessionAction.Close, t0.AddSeconds(60), 1_000, 5m));
        await _store.OpenAsync(t0.AddSeconds(90));

        using var scope = _provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entry = await db.AuditLogs.SingleAsync(a => a.Action == "session.merge");
        Assert.Contains("priorEndedAt", entry.Details);
    }

    [Fact]
    public async Task RecoverActiveSession_returns_null_when_db_is_clean()
    {
        var recovered = await _store.RecoverActiveSessionAsync();
        Assert.Null(recovered);
    }

    [Fact]
    public async Task RecoverActiveSession_picks_up_open_session_after_simulated_reboot()
    {
        var t0 = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        await _store.OpenAsync(t0);
        var openId = _store.ActiveSessionId;

        // Simulate reboot: a fresh SessionStore against the same DB.
        var freshStore = new SessionStore(
            _provider.GetRequiredService<IServiceScopeFactory>(),
            _provider.GetRequiredService<ILogger<SessionStore>>());
        var recovered = await freshStore.RecoverActiveSessionAsync();

        Assert.NotNull(recovered);
        Assert.Equal(openId, recovered!.Id);
        Assert.Equal(openId, freshStore.ActiveSessionId);

        // Closing on the recovered store finalizes the original row.
        await freshStore.CloseAsync(new SessionEvent(SessionAction.Close, t0.AddSeconds(120), 500, 5m));
        using var scope = _provider.CreateScope();
        var s = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Sessions.SingleAsync();
        Assert.NotNull(s.EndedAt);
        Assert.Equal(500, s.EnergyWh);
    }

    [Fact]
    public async Task Close_without_active_session_is_a_noop_warning_not_a_throw()
    {
        // No Open called — should log warning and return cleanly.
        await _store.CloseAsync(new SessionEvent(SessionAction.Close, DateTime.UtcNow, 100, 5m));
        Assert.Equal(0, await SessionCount());
    }
}
