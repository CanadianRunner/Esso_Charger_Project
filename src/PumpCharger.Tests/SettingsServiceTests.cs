using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using PumpCharger.Api.Data;
using PumpCharger.Api.Services.Rate;
using PumpCharger.Api.Services.Settings;
using PumpCharger.Core.Settings;

namespace PumpCharger.Tests;

public class SettingsServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly DbContextOptions<AppDbContext> _options;

    public SettingsServiceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
        _options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(_connection).Options;
        using var ctx = new AppDbContext(_options);
        ctx.Database.EnsureCreated();
    }

    public void Dispose() => _connection.Dispose();

    private SettingsService NewService(out AppDbContext db)
    {
        db = new AppDbContext(_options);
        return new SettingsService(db);
    }

    [Fact]
    public async Task Get_returns_null_when_missing()
    {
        var svc = NewService(out _);
        Assert.Null(await svc.GetAsync("does.not.exist"));
    }

    [Fact]
    public async Task Set_then_get_round_trips()
    {
        var svc = NewService(out _);
        await svc.SetAsync("rate.flat_cents_per_kwh", "17");
        var raw = await svc.GetAsync("rate.flat_cents_per_kwh");
        Assert.Equal("17", raw);
    }

    [Fact]
    public async Task Set_writes_audit_log_entry()
    {
        var svc = NewService(out var db);
        await svc.SetAsync("rate.flat_cents_per_kwh", "17", actor: "admin");

        var log = db.AuditLogs.Single();
        Assert.Equal("admin", log.Actor);
        Assert.Equal("settings.update", log.Action);
        Assert.Contains("rate.flat_cents_per_kwh", log.Details);
        Assert.Contains("17", log.Details);
    }

    [Fact]
    public async Task SetIfMissing_only_writes_when_key_absent()
    {
        var svc = NewService(out var db);
        await svc.SetIfMissingAsync("rate.flat_cents_per_kwh", "13");
        await svc.SetIfMissingAsync("rate.flat_cents_per_kwh", "99");

        Assert.Equal("13", await svc.GetAsync("rate.flat_cents_per_kwh"));
        Assert.Equal(1, db.AuditLogs.Count());
    }

    [Fact]
    public async Task GetInt_returns_default_when_unparsable()
    {
        var svc = NewService(out _);
        await svc.SetAsync("foo", "not-an-int");
        Assert.Equal(7, await svc.GetIntAsync("foo", 7));
    }

    [Fact]
    public async Task GetDecimal_parses_invariant_culture()
    {
        var svc = NewService(out _);
        await svc.SetAsync(SettingKeys.SessionIdleThresholdAmps, "0.5");
        Assert.Equal(0.5m, await svc.GetDecimalAsync(SettingKeys.SessionIdleThresholdAmps, 1.0m));
    }

    [Fact]
    public async Task SeedDefaults_writes_all_required_keys()
    {
        var svc = NewService(out _);
        await svc.SeedDefaultsAsync();

        Assert.Equal(RateSourceValues.Manual, await svc.GetAsync(SettingKeys.RateSource));
        Assert.Equal(13, await svc.GetIntAsync(SettingKeys.RateFlatCentsPerKwh, -1));
        Assert.Equal(60, await svc.GetIntAsync(SettingKeys.SessionMergeGraceSeconds, -1));
        Assert.Equal(0.5m, await svc.GetDecimalAsync(SettingKeys.SessionIdleThresholdAmps, -1));
        Assert.Equal(0, await svc.GetLongAsync(SettingKeys.LifetimeOffsetWh, -1));
        Assert.Equal(10, await svc.GetIntAsync(SettingKeys.DisplayMiniRotationSeconds, -1));
    }

    [Fact]
    public async Task SeedDefaults_is_idempotent_and_does_not_overwrite_user_values()
    {
        var svc = NewService(out _);
        await svc.SetAsync(SettingKeys.RateFlatCentsPerKwh, "17", actor: "admin");
        await svc.SeedDefaultsAsync();

        Assert.Equal(17, await svc.GetIntAsync(SettingKeys.RateFlatCentsPerKwh, -1));
    }

    [Fact]
    public async Task SettingsRateProvider_returns_rate_from_settings()
    {
        var svc = NewService(out _);
        await svc.SetAsync(SettingKeys.RateFlatCentsPerKwh, "17");
        var config = new ConfigurationBuilder().Build();

        var provider = new SettingsRateProvider(svc, config);
        Assert.Equal(17, await provider.GetCurrentRateCentsPerKwhAsync());
    }

    [Fact]
    public async Task SettingsRateProvider_falls_back_to_config_default_when_unset()
    {
        var svc = NewService(out _);
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new[] { new KeyValuePair<string, string?>("Pump:DefaultRateCentsPerKwh", "11") })
            .Build();

        var provider = new SettingsRateProvider(svc, config);
        Assert.Equal(11, await provider.GetCurrentRateCentsPerKwhAsync());
    }
}
