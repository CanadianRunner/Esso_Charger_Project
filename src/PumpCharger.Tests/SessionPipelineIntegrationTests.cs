using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using PumpCharger.Api.Config;
using PumpCharger.Api.Data;
using PumpCharger.Api.Services.Rate;
using PumpCharger.Api.Services.Sessions;
using PumpCharger.Api.Services.Settings;
using PumpCharger.Api.Services.External.Fake;
using PumpCharger.Core.Settings;

namespace PumpCharger.Tests;

public class SessionPipelineIntegrationTests : IDisposable
{
    private readonly SqliteConnection _keepalive;
    private readonly ServiceProvider _provider;

    public SessionPipelineIntegrationTests()
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

        using var scope = _provider.CreateScope();
        scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
        scope.ServiceProvider.GetRequiredService<ISettingsService>().SeedDefaultsAsync().GetAwaiter().GetResult();
    }

    public void Dispose()
    {
        _provider.Dispose();
        _keepalive.Dispose();
    }

    [Fact]
    public async Task End_to_end_pipeline_against_fake_simulator_creates_one_session_per_cycle()
    {
        // A virtual clock the fake simulator and the detector both share.
        var nowUtc = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        DateTime Clock() => nowUtc;

        var fakeOpts = new FakeHpwcOptions
        {
            TimeAcceleration = 1.0,
            InitialLifetimeWh = 0,
            ChargeKw = 10.0,
            IdleSeconds = 30,
            PluggedHandshakeSeconds = 5,
            FirstChargeSeconds = 300,
            CyclingPauseSeconds = 30,
            SecondChargeSeconds = 60,
            SessionCompleteSeconds = 15
        };
        var simulator = new FakeHpwcSimulator(fakeOpts, Clock);
        var fakeClient = new FakeHpwcClient(simulator);

        var detector = new SessionDetector();
        var store = new SessionStore(
            _provider.GetRequiredService<IServiceScopeFactory>(),
            _provider.GetRequiredService<ILogger<SessionStore>>());

        // Drive one tick per simulated second through a complete cycle.
        // Cycle length = 30 + 5 + 300 + 30 + 60 + 15 = 440s, then back to Idle.
        for (var second = 0; second <= 460; second++)
        {
            var vitals = await fakeClient.GetVitalsAsync();
            var ev = detector.Process(vitals, nowUtc);
            switch (ev.Action)
            {
                case SessionAction.Open: await store.OpenAsync(ev.AtUtc); break;
                case SessionAction.Close: await store.CloseAsync(ev); break;
            }
            nowUtc = nowUtc.AddSeconds(1);
        }

        using var scope = _provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var sessions = await db.Sessions.OrderBy(s => s.StartedAt).ToListAsync();

        Assert.Single(sessions);
        var s = sessions[0];

        Assert.NotNull(s.EndedAt);
        Assert.False(s.IsMerged);

        // Vehicle connects at t=30s and disconnects at t=440s. Session = 410s.
        Assert.Equal(410, s.DurationSeconds);

        // Charging delivered: 300s (first) + 60s (resumed) at 10kW = 1000 Wh.
        // Allow a few-Wh tolerance for rounding inside the simulator.
        Assert.InRange(s.EnergyWh, 990, 1010);

        Assert.Equal(13, s.RateAtStartCentsPerKwh);  // default seeded
        Assert.InRange(s.PeakKw, 9.5m, 10.5m);

        // 1000 Wh × 13¢/kWh / 1000 = 13¢. Tolerance ±1.
        Assert.InRange(s.CostCents, 12, 14);
    }

    [Fact]
    public async Task Pipeline_handles_unplug_replug_within_grace_as_one_merged_session()
    {
        var nowUtc = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        DateTime Clock() => nowUtc;

        var fakeOpts = new FakeHpwcOptions
        {
            TimeAcceleration = 1.0,
            ChargeKw = 10.0,
            IdleSeconds = 5,
            PluggedHandshakeSeconds = 2,
            FirstChargeSeconds = 60,
            CyclingPauseSeconds = 5,
            SecondChargeSeconds = 30,
            SessionCompleteSeconds = 5
        };
        var simulator = new FakeHpwcSimulator(fakeOpts, Clock);
        var fakeClient = new FakeHpwcClient(simulator);

        var detector = new SessionDetector();
        var store = new SessionStore(
            _provider.GetRequiredService<IServiceScopeFactory>(),
            _provider.GetRequiredService<ILogger<SessionStore>>());

        async Task TickFor(int seconds)
        {
            for (var i = 0; i < seconds; i++)
            {
                var vitals = await fakeClient.GetVitalsAsync();
                var ev = detector.Process(vitals, nowUtc);
                switch (ev.Action)
                {
                    case SessionAction.Open: await store.OpenAsync(ev.AtUtc); break;
                    case SessionAction.Close: await store.CloseAsync(ev); break;
                }
                nowUtc = nowUtc.AddSeconds(1);
            }
        }

        // Drive natural cycle until the simulator unplugs, then manually replug
        // within the merge grace window using a demo control.
        await TickFor(120);  // walk through one full natural cycle (~107s) and into next idle

        using (var scope = _provider.CreateScope())
        {
            var initialCount = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Sessions.CountAsync();
            Assert.True(initialCount >= 1);
        }

        // Force a quick replug inside grace (default 60s) and let it run another short charge.
        simulator.PlugIn();
        simulator.StartCharging();
        await TickFor(30);
        simulator.Unplug();
        await TickFor(2);

        using var scope2 = _provider.CreateScope();
        var sessions = await scope2.ServiceProvider.GetRequiredService<AppDbContext>().Sessions
            .OrderBy(s => s.StartedAt).ToListAsync();

        // The replug should have merged into the most recent session.
        Assert.True(sessions.Any(s => s.IsMerged), "Expected at least one merged session.");
    }
}
