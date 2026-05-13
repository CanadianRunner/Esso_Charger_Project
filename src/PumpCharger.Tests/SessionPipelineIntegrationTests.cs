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

    private static FakeHpwcOptions BuildOpts(int chargingDurationSeconds = 60) => new()
    {
        TimeAcceleration = 1.0,
        InitialLifetimeWh = 0,
        PeakKw = 10.0,
        TaperEndKw = 1.0,
        JitterAmplitudeKw = 0.0,
        PluggedHandshakeSeconds = 2,
        ChargingDurationSeconds = chargingDurationSeconds,
        RampSeconds = 3,
        TrickleSeconds = 3,
        TaperFraction = 0.25,
        SessionCompleteSeconds = 5,
    };

    [Fact]
    public async Task End_to_end_one_triggered_session_lands_one_row_with_realistic_energy()
    {
        var nowUtc = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        DateTime Clock() => nowUtc;

        var opts = BuildOpts(chargingDurationSeconds: 60);
        var simulator = new FakeHpwcSimulator(opts, Clock);
        var fakeClient = new FakeHpwcClient(simulator);

        var detector = new SessionDetector();
        var store = new SessionStore(
            _provider.GetRequiredService<IServiceScopeFactory>(),
            _provider.GetRequiredService<ILogger<SessionStore>>());

        // Trigger a single session.
        simulator.PlugIn();

        // Drive ticks through the full lifetime: handshake + charging + complete + a beat.
        var totalSeconds = opts.PluggedHandshakeSeconds + opts.ChargingDurationSeconds + opts.SessionCompleteSeconds + 3;
        for (var second = 0; second < totalSeconds; second++)
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

        // Avg power over the session should be materially below the flat-peak
        // ceiling because of the ramp + taper + trickle shape.
        var avgKw = s.EnergyWh / 1000.0 / (s.DurationSeconds / 3600.0);
        Assert.True(avgKw > 0, "session should have accumulated some energy");
        Assert.True(avgKw < opts.PeakKw, $"avg kW ({avgKw:F2}) should be below peak ({opts.PeakKw})");

        Assert.InRange(s.PeakKw, 9.0m, 10.5m);
    }

    [Fact]
    public async Task Replug_within_grace_window_merges_into_the_prior_session_row()
    {
        var nowUtc = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        DateTime Clock() => nowUtc;

        var opts = BuildOpts(chargingDurationSeconds: 30);
        var simulator = new FakeHpwcSimulator(opts, Clock);
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

        // First session, full lifecycle.
        simulator.PlugIn();
        await TickFor(opts.PluggedHandshakeSeconds + opts.ChargingDurationSeconds + opts.SessionCompleteSeconds + 2);

        using (var scope = _provider.CreateScope())
        {
            var initialCount = await scope.ServiceProvider.GetRequiredService<AppDbContext>().Sessions.CountAsync();
            Assert.Equal(1, initialCount);
        }

        // Replug within the merge grace window (default 60s).
        await TickFor(5);
        simulator.PlugIn();
        await TickFor(opts.PluggedHandshakeSeconds + opts.ChargingDurationSeconds + opts.SessionCompleteSeconds + 2);

        using var scope2 = _provider.CreateScope();
        var sessions = await scope2.ServiceProvider.GetRequiredService<AppDbContext>().Sessions
            .OrderBy(s => s.StartedAt).ToListAsync();
        Assert.Single(sessions);
        Assert.True(sessions[0].IsMerged, "Expected merged into the prior session row.");
    }
}
