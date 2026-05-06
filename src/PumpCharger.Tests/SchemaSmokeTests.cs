using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using PumpCharger.Api.Data;
using PumpCharger.Core.Entities;

namespace PumpCharger.Tests;

public class SchemaSmokeTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly DbContextOptions<AppDbContext> _options;

    public SchemaSmokeTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
        _options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;

        using var ctx = new AppDbContext(_options);
        ctx.Database.EnsureCreated();
    }

    public void Dispose() => _connection.Dispose();

    [Fact]
    public void Schema_creates_all_expected_tables()
    {
        using var ctx = new AppDbContext(_options);

        Assert.Equal(0, ctx.Sessions.Count());
        Assert.Equal(0, ctx.LifetimeSnapshots.Count());
        Assert.Equal(0, ctx.Settings.Count());
        Assert.Equal(0, ctx.RateHistory.Count());
        Assert.Equal(0, ctx.AuditLogs.Count());
    }

    [Fact]
    public void Session_round_trips_through_db()
    {
        var sessionId = Guid.NewGuid();
        var startedAt = new DateTime(2026, 1, 15, 10, 0, 0, DateTimeKind.Utc);
        var endedAt = startedAt.AddHours(1);

        using (var ctx = new AppDbContext(_options))
        {
            ctx.Sessions.Add(new Session
            {
                Id = sessionId,
                StartedAt = startedAt,
                EndedAt = endedAt,
                EnergyWh = 11_500,
                RateAtStartCentsPerKwh = 13,
                CostCents = 150,
                PeakKw = 11.50m,
                DurationSeconds = 3600,
                IsMerged = false,
                Notes = "smoke"
            });
            ctx.SaveChanges();
        }

        using (var ctx = new AppDbContext(_options))
        {
            var loaded = ctx.Sessions.Single();
            Assert.Equal(sessionId, loaded.Id);
            Assert.Equal(11_500, loaded.EnergyWh);
            Assert.Equal(11.50m, loaded.PeakKw);
            Assert.Equal("smoke", loaded.Notes);
        }
    }

    [Fact]
    public void Setting_uses_key_as_primary_key()
    {
        using (var ctx = new AppDbContext(_options))
        {
            ctx.Settings.Add(new Setting
            {
                Key = "rate.flat_cents_per_kwh",
                Value = "13",
                UpdatedAt = DateTime.UtcNow
            });
            ctx.SaveChanges();
        }

        using (var ctx = new AppDbContext(_options))
        {
            var loaded = ctx.Settings.Find("rate.flat_cents_per_kwh");
            Assert.NotNull(loaded);
            Assert.Equal("13", loaded!.Value);
        }
    }

    [Fact]
    public void RateHistory_persists_source_enum()
    {
        using (var ctx = new AppDbContext(_options))
        {
            ctx.RateHistory.Add(new RateHistory
            {
                EffectiveFrom = DateTime.UtcNow,
                CentsPerKwh = 13,
                Source = RateSource.Manual
            });
            ctx.RateHistory.Add(new RateHistory
            {
                EffectiveFrom = DateTime.UtcNow.AddDays(-1),
                CentsPerKwh = 14,
                Source = RateSource.OpenEI,
                OpenEiScheduleId = "sched-7"
            });
            ctx.SaveChanges();
        }

        using (var ctx = new AppDbContext(_options))
        {
            var manual = ctx.RateHistory.Single(r => r.Source == RateSource.Manual);
            var openei = ctx.RateHistory.Single(r => r.Source == RateSource.OpenEI);
            Assert.Equal(13, manual.CentsPerKwh);
            Assert.Equal("sched-7", openei.OpenEiScheduleId);
        }
    }
}
