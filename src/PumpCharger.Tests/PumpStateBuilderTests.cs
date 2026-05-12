using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using PumpCharger.Api.Data;
using PumpCharger.Api.Services.Display;
using PumpCharger.Api.Services.Rate;
using PumpCharger.Api.Services.Sessions;
using PumpCharger.Api.Services.Settings;
using PumpCharger.Core.Entities;
using PumpCharger.Core.External.Models;
using PumpCharger.Core.Settings;

namespace PumpCharger.Tests;

public class PumpStateBuilderTests : IDisposable
{
    private readonly SqliteConnection _keepalive;
    private readonly ServiceProvider _provider;

    public PumpStateBuilderTests()
    {
        _keepalive = new SqliteConnection("DataSource=:memory:");
        _keepalive.Open();

        var services = new ServiceCollection();
        services.AddDbContext<AppDbContext>(o => o.UseSqlite(_keepalive));
        services.AddScoped<ISettingsService, SettingsService>();
        services.AddScoped<ICurrentRateProvider, SettingsRateProvider>();
        services.AddScoped<PumpStateBuilder>();
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

    private async Task<PumpStateBuilder> NewBuilder() =>
        await Task.FromResult(_provider.CreateScope().ServiceProvider.GetRequiredService<PumpStateBuilder>());

    [Fact]
    public async Task Idle_state_returns_no_session_and_lifetime_includes_offset()
    {
        using var scope = _provider.CreateScope();
        var settings = scope.ServiceProvider.GetRequiredService<ISettingsService>();
        await settings.SetAsync(SettingKeys.LifetimeOffsetWh, "1000");

        var builder = scope.ServiceProvider.GetRequiredService<PumpStateBuilder>();
        var state = await builder.BuildAsync(
            new HpwcVitals { VehicleConnected = false },
            new HpwcLifetime { EnergyWh = 50_000 },
            DateTime.UtcNow,
            hpwcConnected: true, shellyConnected: false);

        Assert.Equal("idle", state.State);
        Assert.Null(state.Session);
        Assert.Equal(51.0, state.Totals.LifetimeKwh);
        Assert.True(state.Health.HpwcConnected);
        Assert.False(state.Health.ShellyConnected);
    }

    [Fact]
    public async Task Active_session_payload_combines_db_energy_and_live_vitals()
    {
        using (var scope = _provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Sessions.Add(new Session
            {
                Id = Guid.NewGuid(),
                StartedAt = DateTime.UtcNow.AddMinutes(-10),
                EndedAt = null,
                EnergyWh = 500,                  // prior merged segment
                RateAtStartCentsPerKwh = 13,
                IsMerged = true
            });
            await db.SaveChangesAsync();
        }

        using var s = _provider.CreateScope();
        var builder = s.ServiceProvider.GetRequiredService<PumpStateBuilder>();
        var state = await builder.BuildAsync(
            new HpwcVitals
            {
                VehicleConnected = true,
                ContactorClosed = true,
                VoltageA = 120, VoltageB = 120,
                CurrentAA = 41.5, CurrentBA = 41.5,
                SessionEnergyWh = 750            // current physical-connection accumulation
            },
            new HpwcLifetime { EnergyWh = 100_000 },
            DateTime.UtcNow,
            hpwcConnected: true, shellyConnected: false);

        Assert.Equal("charging", state.State);
        Assert.NotNull(state.Session);
        // 500 + 750 = 1250 Wh = 1.25 kWh
        Assert.Equal(1.25, state.Session!.EnergyKwh);
        // 1250 × 13 / 1000 = 16¢
        Assert.Equal(16, state.Session.CostCents);
        Assert.True(state.Session.LiveKw > 9.5);
    }

    [Fact]
    public async Task Year_to_date_sums_only_current_year_completed_sessions()
    {
        var now = new DateTime(2026, 6, 15, 0, 0, 0, DateTimeKind.Utc);

        using (var scope = _provider.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Sessions.Add(new Session  // last year — should NOT count
            {
                Id = Guid.NewGuid(),
                StartedAt = new DateTime(2025, 12, 30, 0, 0, 0, DateTimeKind.Utc),
                EndedAt = new DateTime(2025, 12, 30, 1, 0, 0, DateTimeKind.Utc),
                EnergyWh = 5_000,
                RateAtStartCentsPerKwh = 13
            });
            db.Sessions.Add(new Session  // YTD completed — counts
            {
                Id = Guid.NewGuid(),
                StartedAt = new DateTime(2026, 3, 1, 0, 0, 0, DateTimeKind.Utc),
                EndedAt = new DateTime(2026, 3, 1, 2, 0, 0, DateTimeKind.Utc),
                EnergyWh = 12_000,
                RateAtStartCentsPerKwh = 13
            });
            db.Sessions.Add(new Session  // YTD in-progress — should NOT count (no EndedAt)
            {
                Id = Guid.NewGuid(),
                StartedAt = now.AddMinutes(-5),
                EndedAt = null,
                EnergyWh = 0,
                RateAtStartCentsPerKwh = 13
            });
            await db.SaveChangesAsync();
        }

        using var s = _provider.CreateScope();
        var builder = s.ServiceProvider.GetRequiredService<PumpStateBuilder>();
        var state = await builder.BuildAsync(
            new HpwcVitals { VehicleConnected = false },
            new HpwcLifetime { EnergyWh = 0 },
            now,
            hpwcConnected: true, shellyConnected: false);

        Assert.Equal(12.0, state.Totals.YearToDateKwh);
        // Per spec rotation list, SessionCount is all-time, not YTD — 2 completed sessions exist.
        Assert.Equal(2, state.Totals.SessionCount);
    }

    [Fact]
    public async Task Rate_payload_uses_current_settings_value()
    {
        using (var scope = _provider.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<ISettingsService>()
                .SetAsync(SettingKeys.RateFlatCentsPerKwh, "21");
        }

        using var s = _provider.CreateScope();
        var builder = s.ServiceProvider.GetRequiredService<PumpStateBuilder>();
        var state = await builder.BuildAsync(
            new HpwcVitals { VehicleConnected = false },
            new HpwcLifetime(),
            DateTime.UtcNow,
            hpwcConnected: true, shellyConnected: false);

        Assert.Equal(21, state.Rate.CentsPerKwh);
        Assert.Equal("manual", state.Health.RateSource);
    }

    [Fact]
    public async Task Display_payload_includes_rotation_and_post_session_timings_from_settings()
    {
        // Defaults from SeedDefaultsAsync — 10s rotation, 300s bright, 600s dim.
        using var s = _provider.CreateScope();
        var builder = s.ServiceProvider.GetRequiredService<PumpStateBuilder>();
        var state = await builder.BuildAsync(
            new HpwcVitals { VehicleConnected = false },
            new HpwcLifetime(),
            DateTime.UtcNow,
            hpwcConnected: true, shellyConnected: false);

        Assert.Equal(10, state.Display.MiniRotationSeconds);
        Assert.Equal(300, state.Display.PostSessionBrightSeconds);
        Assert.Equal(600, state.Display.PostSessionDimSeconds);
    }

    [Fact]
    public async Task Display_payload_reflects_admin_overrides()
    {
        using (var scope = _provider.CreateScope())
        {
            var settings = scope.ServiceProvider.GetRequiredService<ISettingsService>();
            await settings.SetAsync(SettingKeys.DisplayMiniRotationSeconds, "5");
            await settings.SetAsync(SettingKeys.DisplayPostSessionBrightSeconds, "120");
            await settings.SetAsync(SettingKeys.DisplayPostSessionDimSeconds, "240");
        }

        using var s = _provider.CreateScope();
        var builder = s.ServiceProvider.GetRequiredService<PumpStateBuilder>();
        var state = await builder.BuildAsync(
            new HpwcVitals { VehicleConnected = false },
            new HpwcLifetime(),
            DateTime.UtcNow,
            hpwcConnected: true, shellyConnected: false);

        Assert.Equal(5, state.Display.MiniRotationSeconds);
        Assert.Equal(120, state.Display.PostSessionBrightSeconds);
        Assert.Equal(240, state.Display.PostSessionDimSeconds);
    }
}
