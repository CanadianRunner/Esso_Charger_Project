using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using PumpCharger.Api.Data;
using PumpCharger.Api.Services.Polling;
using PumpCharger.Api.Services.Rate;
using PumpCharger.Api.Services.Sessions;
using PumpCharger.Api.Services.Settings;
using PumpCharger.Core.Entities;
using PumpCharger.Core.External.Models;
using PumpCharger.Core.Settings;

namespace PumpCharger.Tests.Sessions;

public class SessionPowerSamplerTests : IDisposable
{
    private readonly SqliteConnection _keepalive;
    private readonly ServiceProvider _provider;
    private readonly SessionStore _store;
    private readonly SessionPowerSampler _sampler;

    public SessionPowerSamplerTests()
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

        _sampler = new SessionPowerSampler(
            bus: new VitalsBus(), // not exercised by ProcessAsync
            _store,
            _provider.GetRequiredService<IServiceScopeFactory>(),
            _provider.GetRequiredService<ILogger<SessionPowerSampler>>());
    }

    public void Dispose()
    {
        _provider.Dispose();
        _keepalive.Dispose();
    }

    private async Task<string?> ActiveSessionSamplesJsonAsync()
    {
        var id = _store.ActiveSessionId ?? throw new InvalidOperationException("no active session");
        using var scope = _provider.CreateScope();
        var session = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Sessions.SingleAsync(s => s.Id == id);
        return session.PowerSamplesJson;
    }

    private async Task SetIntervalAsync(int seconds)
    {
        using var scope = _provider.CreateScope();
        var settings = scope.ServiceProvider.GetRequiredService<ISettingsService>();
        await settings.SetAsync(SettingKeys.SessionPowerSampleIntervalSeconds, seconds.ToString());
    }

    private static TimedVitals Charging(DateTime at, double liveKw)
    {
        // HpwcVitals.LiveKw = (VoltageA*CurrentAA + VoltageB*CurrentBA) / 1000.
        // Synthesize via VoltageA only so the math is trivial.
        return new TimedVitals(at, new HpwcVitals
        {
            VoltageA = 240,
            CurrentAA = liveKw * 1000.0 / 240.0,
            ContactorClosed = true,
            VehicleConnected = true,
        });
    }

    private static TimedVitals Idle(DateTime at) => new(at, new HpwcVitals());

    [Fact]
    public async Task First_charging_tick_creates_an_immediate_sample()
    {
        var t0 = new DateTime(2026, 5, 11, 12, 0, 0, DateTimeKind.Utc);
        await _store.OpenAsync(t0);

        await _sampler.ProcessAsync(Charging(t0, 7.0), CancellationToken.None);

        var samples = PowerSampleSerializer.Parse(await ActiveSessionSamplesJsonAsync());
        Assert.Single(samples);
        Assert.Equal(7.0, samples[0].Kw);
    }

    [Fact]
    public async Task Within_interval_ticks_do_not_create_new_samples()
    {
        var t0 = new DateTime(2026, 5, 11, 12, 0, 0, DateTimeKind.Utc);
        await _store.OpenAsync(t0);

        await _sampler.ProcessAsync(Charging(t0, 7.0), CancellationToken.None);
        await _sampler.ProcessAsync(Charging(t0.AddSeconds(3), 7.1), CancellationToken.None);
        await _sampler.ProcessAsync(Charging(t0.AddSeconds(9), 7.2), CancellationToken.None);

        var samples = PowerSampleSerializer.Parse(await ActiveSessionSamplesJsonAsync());
        Assert.Single(samples);
    }

    [Fact]
    public async Task After_interval_ticks_create_additional_samples()
    {
        var t0 = new DateTime(2026, 5, 11, 12, 0, 0, DateTimeKind.Utc);
        await _store.OpenAsync(t0);

        await _sampler.ProcessAsync(Charging(t0, 7.0), CancellationToken.None);
        await _sampler.ProcessAsync(Charging(t0.AddSeconds(10), 7.2), CancellationToken.None);
        await _sampler.ProcessAsync(Charging(t0.AddSeconds(20), 7.3), CancellationToken.None);

        var samples = PowerSampleSerializer.Parse(await ActiveSessionSamplesJsonAsync());
        Assert.Equal(3, samples.Count);
        Assert.Equal(new[] { 7.0, 7.2, 7.3 }, samples.Select(s => s.Kw));
    }

    [Fact]
    public async Task Ticks_with_low_kw_do_not_create_samples()
    {
        var t0 = new DateTime(2026, 5, 11, 12, 0, 0, DateTimeKind.Utc);
        await _store.OpenAsync(t0);

        await _sampler.ProcessAsync(Idle(t0), CancellationToken.None);
        await _sampler.ProcessAsync(Charging(t0.AddSeconds(1), 0.05), CancellationToken.None);

        Assert.Null(await ActiveSessionSamplesJsonAsync());
    }

    [Fact]
    public async Task Idle_tick_resets_cadence_so_resume_samples_immediately()
    {
        var t0 = new DateTime(2026, 5, 11, 12, 0, 0, DateTimeKind.Utc);
        await _store.OpenAsync(t0);

        await _sampler.ProcessAsync(Charging(t0, 7.0), CancellationToken.None);
        await _sampler.ProcessAsync(Idle(t0.AddSeconds(3)), CancellationToken.None);
        // Charging resumes only 4s after the prior sample — below the 10s interval —
        // but the idle tick reset the cadence, so this sample should land immediately.
        await _sampler.ProcessAsync(Charging(t0.AddSeconds(4), 7.5), CancellationToken.None);

        var samples = PowerSampleSerializer.Parse(await ActiveSessionSamplesJsonAsync());
        Assert.Equal(2, samples.Count);
    }

    [Fact]
    public async Task Tick_with_no_active_session_writes_nothing()
    {
        var t0 = new DateTime(2026, 5, 11, 12, 0, 0, DateTimeKind.Utc);
        // No OpenAsync — no active session.
        await _sampler.ProcessAsync(Charging(t0, 7.0), CancellationToken.None);

        using var scope = _provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(await db.Sessions.ToListAsync());
    }

    [Fact]
    public async Task Configured_interval_is_respected()
    {
        await SetIntervalAsync(30);
        var t0 = new DateTime(2026, 5, 11, 12, 0, 0, DateTimeKind.Utc);
        await _store.OpenAsync(t0);

        await _sampler.ProcessAsync(Charging(t0, 7.0), CancellationToken.None);
        await _sampler.ProcessAsync(Charging(t0.AddSeconds(15), 7.1), CancellationToken.None); // < 30s gap
        await _sampler.ProcessAsync(Charging(t0.AddSeconds(30), 7.2), CancellationToken.None); // exactly 30s

        var samples = PowerSampleSerializer.Parse(await ActiveSessionSamplesJsonAsync());
        Assert.Equal(2, samples.Count);
        Assert.Equal(new[] { 7.0, 7.2 }, samples.Select(s => s.Kw));
    }

    [Fact]
    public async Task Samples_accumulate_across_a_session_merge()
    {
        var t0 = new DateTime(2026, 5, 11, 12, 0, 0, DateTimeKind.Utc);
        await _store.OpenAsync(t0);

        // First charging segment
        await _sampler.ProcessAsync(Charging(t0, 7.0), CancellationToken.None);
        await _sampler.ProcessAsync(Charging(t0.AddSeconds(10), 7.1), CancellationToken.None);

        // Session closes
        await _store.CloseAsync(new SessionEvent(SessionAction.Close, t0.AddSeconds(20), 100, 7.1m));
        await _sampler.ProcessAsync(Idle(t0.AddSeconds(21)), CancellationToken.None);

        // Re-open within grace window — the row is reused (IsMerged=true), so PowerSamplesJson persists.
        await _store.OpenAsync(t0.AddSeconds(40));
        Assert.NotNull(_store.ActiveSessionId);

        // Second charging segment appends to the same row.
        await _sampler.ProcessAsync(Charging(t0.AddSeconds(40), 7.5), CancellationToken.None);
        await _sampler.ProcessAsync(Charging(t0.AddSeconds(50), 7.6), CancellationToken.None);

        var samples = PowerSampleSerializer.Parse(await ActiveSessionSamplesJsonAsync());
        Assert.Equal(4, samples.Count);
        Assert.Equal(new[] { 7.0, 7.1, 7.5, 7.6 }, samples.Select(s => s.Kw));

        // Sanity: only one session row.
        using var scope = _provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Single(await db.Sessions.ToListAsync());
    }
}
