using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using PumpCharger.Api.Data;
using PumpCharger.Api.Services.Polling;
using PumpCharger.Core.Entities;
using PumpCharger.Core.External.Models;
using PumpCharger.Tests.Auth;

namespace PumpCharger.Tests.Admin;

public class AdminDashboardTests : IClassFixture<TestApiFactory>
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private record SessionSummaryDto(
        Guid Id,
        DateTime StartedAt,
        DateTime? EndedAt,
        long DurationSeconds,
        double EnergyKwh,
        long CostCents,
        bool IsMerged);

    private record AggregatesDto(double TodayKwh, double ThisMonthKwh, double ThisYearKwh);

    private record HealthDto(
        DateTime? LastPollUtc,
        int ConsecutiveFailures,
        bool ControllerResponsive,
        bool VehicleConnected,
        bool ContactorClosed);

    private record DashboardResponse(
        IReadOnlyList<SessionSummaryDto> RecentSessions,
        AggregatesDto Aggregates,
        HealthDto Health);

    [Fact]
    public async Task Unauthenticated_request_returns_401()
    {
        await using var factory = new TestApiFactory();
        var client = factory.CreateClient();
        var resp = await client.GetAsync("/api/admin/dashboard");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task Authenticated_request_returns_empty_payload_on_a_fresh_db()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);

        var resp = await client.GetAsync("/api/admin/dashboard");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var body = await resp.Content.ReadFromJsonAsync<DashboardResponse>(JsonOpts);
        Assert.NotNull(body);
        Assert.Empty(body!.RecentSessions);
        Assert.Equal(0, body.Aggregates.TodayKwh);
        Assert.Equal(0, body.Aggregates.ThisMonthKwh);
        Assert.Equal(0, body.Aggregates.ThisYearKwh);
        // LastPollUtc / ControllerResponsive depend on the background poller and
        // are exercised in Health_response_includes_poll_state.
    }

    [Fact]
    public async Task Returns_recent_sessions_and_aggregates_from_db()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);

        // Anchor seeded dates to today's UTC start rather than relative offsets
        // off DateTime.UtcNow, so the test isn't flaky near UTC midnight.
        var now = DateTime.UtcNow;
        var todayStart = new DateTime(now.Year, now.Month, now.Day, 0, 0, 0, DateTimeKind.Utc);
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var yearStart = new DateTime(now.Year, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        await SeedSessionsAsync(factory,
            (todayStart.AddHours(12), todayStart.AddHours(13), 10_000L, false),  // today, 10 kWh
            (monthStart.AddDays(5), monthStart.AddDays(5).AddHours(1), 5_000L, true),  // this month, 5 kWh, merged
            (yearStart.AddDays(20), yearStart.AddDays(20).AddHours(2), 8_000L, false));  // this year, 8 kWh

        var resp = await client.GetAsync("/api/admin/dashboard");
        var body = await resp.Content.ReadFromJsonAsync<DashboardResponse>(JsonOpts);

        Assert.NotNull(body);
        Assert.Equal(3, body!.RecentSessions.Count);
        // Newest first.
        Assert.True(body.RecentSessions[0].StartedAt > body.RecentSessions[1].StartedAt);
        Assert.Contains(body.RecentSessions, s => s.IsMerged);

        Assert.Equal(10.0, body.Aggregates.TodayKwh, 3);
        Assert.Equal(15.0, body.Aggregates.ThisMonthKwh, 3);
        Assert.Equal(23.0, body.Aggregates.ThisYearKwh, 3);
    }

    [Fact]
    public async Task Active_session_appears_in_recent_but_not_aggregates()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);

        var now = DateTime.UtcNow;
        await SeedSessionsAsync(factory,
            (now.AddMinutes(-30), null, 4_000L, false));  // in-progress, 4 kWh so far

        var body = await (await client.GetAsync("/api/admin/dashboard"))
            .Content.ReadFromJsonAsync<DashboardResponse>(JsonOpts);

        Assert.NotNull(body);
        Assert.Single(body!.RecentSessions);
        Assert.Null(body.RecentSessions[0].EndedAt);
        Assert.Equal(0, body.Aggregates.TodayKwh);
    }

    [Fact]
    public async Task Health_response_includes_poll_state()
    {
        // The background HpwcPollerService is live in Development mode (with the
        // Fake HPWC client), so by the time the request lands the poller has
        // recorded at least one successful poll. Assert on observable structure
        // rather than racing the poller.
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);

        // Give the poller a moment to tick at least once.
        await Task.Delay(200);

        var resp = await client.GetAsync("/api/admin/dashboard");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        var body = await resp.Content.ReadFromJsonAsync<DashboardResponse>(JsonOpts);

        Assert.NotNull(body);
        Assert.NotNull(body!.Health.LastPollUtc);
        Assert.True(body.Health.ControllerResponsive);
        Assert.True(body.Health.ConsecutiveFailures >= 0);
    }

    private static async Task<HttpClient> CreateAuthenticatedClientAsync(TestApiFactory factory)
    {
        var client = factory.CreateClient();
        await client.PostAsJsonAsync("/api/auth/setup", new { Password = "pw" });
        await client.PostAsJsonAsync("/api/auth/login", new { Password = "pw", RememberDevice = false });
        return client;
    }

    private static async Task SeedSessionsAsync(
        TestApiFactory factory,
        params (DateTime StartedAt, DateTime? EndedAt, long EnergyWh, bool IsMerged)[] rows)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        foreach (var r in rows)
        {
            db.Sessions.Add(new Session
            {
                Id = Guid.NewGuid(),
                StartedAt = r.StartedAt,
                EndedAt = r.EndedAt,
                EnergyWh = r.EnergyWh,
                RateAtStartCentsPerKwh = 13,
                CostCents = r.EnergyWh * 13 / 1_000,
                PeakKw = 0,
                DurationSeconds = r.EndedAt is null ? 0 : (long)(r.EndedAt.Value - r.StartedAt).TotalSeconds,
                IsMerged = r.IsMerged,
            });
        }
        await db.SaveChangesAsync();
    }
}
