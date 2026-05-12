using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PumpCharger.Api.Data;
using PumpCharger.Core.Entities;
using PumpCharger.Tests.Auth;

namespace PumpCharger.Tests.Admin;

public class AdminSessionsTests
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

    private record SessionListResponse(
        IReadOnlyList<SessionSummaryDto> Items,
        int TotalCount,
        int Page,
        int PageSize);

    private record PowerSampleDto(long UnixSecondsUtc, double Kw);

    private record SessionDetailResponse(
        Guid Id,
        DateTime StartedAt,
        DateTime? EndedAt,
        long DurationSeconds,
        double EnergyKwh,
        long CostCents,
        decimal PeakKw,
        int RateAtStartCentsPerKwh,
        bool IsMerged,
        string? Notes,
        IReadOnlyList<PowerSampleDto> PowerSamples);

    [Fact]
    public async Task Unauthenticated_list_returns_401()
    {
        await using var factory = new TestApiFactory();
        var client = factory.CreateClient();
        var resp = await client.GetAsync("/api/admin/sessions");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task List_returns_sessions_newest_first_by_default()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);

        var t = DateTime.UtcNow;
        await SeedSessionsAsync(factory,
            new SeedSession(t.AddDays(-3), t.AddDays(-3).AddHours(1), 10_000L, false),
            new SeedSession(t.AddDays(-1), t.AddDays(-1).AddHours(1), 12_000L, false),
            new SeedSession(t.AddDays(-2), t.AddDays(-2).AddHours(1), 8_000L, true));

        var body = await GetJsonAsync<SessionListResponse>(client, "/api/admin/sessions");
        Assert.Equal(3, body.TotalCount);
        Assert.True(body.Items[0].StartedAt > body.Items[1].StartedAt);
        Assert.True(body.Items[1].StartedAt > body.Items[2].StartedAt);
    }

    [Fact]
    public async Task List_filters_by_date_range_on_started_at()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);
        var t = new DateTime(2026, 5, 15, 12, 0, 0, DateTimeKind.Utc);
        await SeedSessionsAsync(factory,
            new SeedSession(t.AddDays(-10), t.AddDays(-10).AddHours(1), 1000L, false),
            new SeedSession(t.AddDays(-5), t.AddDays(-5).AddHours(1), 2000L, false),
            new SeedSession(t.AddDays(-1), t.AddDays(-1).AddHours(1), 3000L, false));

        var from = t.AddDays(-7).ToString("o");
        var to = t.AddDays(-2).ToString("o");
        var body = await GetJsonAsync<SessionListResponse>(client,
            $"/api/admin/sessions?from={Uri.EscapeDataString(from)}&to={Uri.EscapeDataString(to)}");
        Assert.Single(body.Items);
        Assert.Equal(2.0, body.Items[0].EnergyKwh);
    }

    [Fact]
    public async Task List_filters_by_merged_toggle()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);
        var t = DateTime.UtcNow;
        await SeedSessionsAsync(factory,
            new SeedSession(t.AddHours(-3), t.AddHours(-2), 1000L, false),
            new SeedSession(t.AddHours(-2), t.AddHours(-1), 2000L, true));

        var merged = await GetJsonAsync<SessionListResponse>(client, "/api/admin/sessions?merged=true");
        Assert.Single(merged.Items);
        Assert.True(merged.Items[0].IsMerged);

        var unmerged = await GetJsonAsync<SessionListResponse>(client, "/api/admin/sessions?merged=false");
        Assert.Single(unmerged.Items);
        Assert.False(unmerged.Items[0].IsMerged);
    }

    [Fact]
    public async Task List_filters_by_active_toggle()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);
        var t = DateTime.UtcNow;
        await SeedSessionsAsync(factory,
            new SeedSession(t.AddHours(-3), t.AddHours(-2), 1000L, false),
            new SeedSession(t.AddHours(-1), null, 500L, false));

        var active = await GetJsonAsync<SessionListResponse>(client, "/api/admin/sessions?active=true");
        Assert.Single(active.Items);
        Assert.Null(active.Items[0].EndedAt);

        var ended = await GetJsonAsync<SessionListResponse>(client, "/api/admin/sessions?active=false");
        Assert.Single(ended.Items);
        Assert.NotNull(ended.Items[0].EndedAt);
    }

    [Fact]
    public async Task List_sorts_by_energy_descending()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);
        var t = DateTime.UtcNow;
        await SeedSessionsAsync(factory,
            new SeedSession(t.AddHours(-3), t.AddHours(-2), 5_000L, false),
            new SeedSession(t.AddHours(-4), t.AddHours(-3), 20_000L, false),
            new SeedSession(t.AddHours(-2), t.AddHours(-1), 12_000L, false));

        var body = await GetJsonAsync<SessionListResponse>(client, "/api/admin/sessions?sort=energy&dir=desc");
        Assert.Equal(new[] { 20.0, 12.0, 5.0 }, body.Items.Select(i => i.EnergyKwh));
    }

    [Fact]
    public async Task List_paginates()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);
        var t = DateTime.UtcNow;
        var rows = Enumerable.Range(0, 30)
            .Select(i => new SeedSession(t.AddMinutes(-i), t.AddMinutes(-i).AddMinutes(1), (i + 1) * 100L, false))
            .ToArray();
        await SeedSessionsAsync(factory, rows);

        var page1 = await GetJsonAsync<SessionListResponse>(client, "/api/admin/sessions?page=1&pageSize=25");
        Assert.Equal(25, page1.Items.Count);
        Assert.Equal(30, page1.TotalCount);

        var page2 = await GetJsonAsync<SessionListResponse>(client, "/api/admin/sessions?page=2&pageSize=25");
        Assert.Equal(5, page2.Items.Count);
    }

    [Fact]
    public async Task Get_detail_returns_parsed_power_samples()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);
        var t = DateTime.UtcNow;
        var id = Guid.NewGuid();

        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Sessions.Add(new Session
            {
                Id = id,
                StartedAt = t.AddHours(-1),
                EndedAt = t,
                EnergyWh = 7_000,
                RateAtStartCentsPerKwh = 13,
                CostCents = 91,
                PeakKw = 7.1m,
                DurationSeconds = 3600,
                IsMerged = false,
                Notes = "trip to work",
                PowerSamplesJson = "[[1715472000,7.2],[1715472010,7.3]]",
            });
            await db.SaveChangesAsync();
        }

        var body = await GetJsonAsync<SessionDetailResponse>(client, $"/api/admin/sessions/{id}");
        Assert.Equal(id, body.Id);
        Assert.Equal("trip to work", body.Notes);
        Assert.Equal(2, body.PowerSamples.Count);
        Assert.Equal(1715472000L, body.PowerSamples[0].UnixSecondsUtc);
        Assert.Equal(7.2, body.PowerSamples[0].Kw);
    }

    [Fact]
    public async Task Get_detail_404s_for_unknown_id()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);
        var resp = await client.GetAsync($"/api/admin/sessions/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, resp.StatusCode);
    }

    [Fact]
    public async Task Patch_notes_succeeds_and_audits()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);
        var id = await SeedOneEndedSessionAsync(factory);

        var resp = await client.PatchAsJsonAsync($"/api/admin/sessions/{id}", new { Notes = "a longer trip" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal("a longer trip", (await db.Sessions.SingleAsync(s => s.Id == id)).Notes);
        Assert.Contains(await db.AuditLogs.ToListAsync(), e => e.Action == "session.update_notes");
    }

    [Fact]
    public async Task Patch_isMerged_on_ended_session_succeeds_and_audits()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);
        var id = await SeedOneEndedSessionAsync(factory);

        var resp = await client.PatchAsJsonAsync($"/api/admin/sessions/{id}", new { IsMerged = true });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.True((await db.Sessions.SingleAsync(s => s.Id == id)).IsMerged);
        Assert.Contains(await db.AuditLogs.ToListAsync(), e => e.Action == "session.update_merged");
    }

    [Fact]
    public async Task Patch_isMerged_on_active_session_returns_400()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);
        var id = await SeedOneActiveSessionAsync(factory);

        var resp = await client.PatchAsJsonAsync($"/api/admin/sessions/{id}", new { IsMerged = true });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Patch_notes_on_active_session_succeeds()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);
        var id = await SeedOneActiveSessionAsync(factory);

        var resp = await client.PatchAsJsonAsync($"/api/admin/sessions/{id}", new { Notes = "live note" });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task Delete_ended_session_succeeds_and_audits()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);
        var id = await SeedOneEndedSessionAsync(factory);

        var resp = await client.DeleteAsync($"/api/admin/sessions/{id}");
        Assert.Equal(HttpStatusCode.NoContent, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(await db.Sessions.Where(s => s.Id == id).ToListAsync());
        Assert.Contains(await db.AuditLogs.ToListAsync(), e => e.Action == "session.delete");
    }

    [Fact]
    public async Task Delete_active_session_returns_400_and_keeps_row()
    {
        await using var factory = new TestApiFactory();
        var client = await CreateAuthenticatedClientAsync(factory);
        var id = await SeedOneActiveSessionAsync(factory);

        var resp = await client.DeleteAsync($"/api/admin/sessions/{id}");
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.NotEmpty(await db.Sessions.Where(s => s.Id == id).ToListAsync());
    }

    // ---------- helpers ----------

    private record SeedSession(DateTime StartedAt, DateTime? EndedAt, long EnergyWh, bool IsMerged);

    private static async Task<HttpClient> CreateAuthenticatedClientAsync(TestApiFactory factory)
    {
        var client = factory.CreateClient();
        await client.PostAsJsonAsync("/api/auth/setup", new { Password = "pw" });
        await client.PostAsJsonAsync("/api/auth/login", new { Password = "pw", RememberDevice = false });
        return client;
    }

    private static async Task<T> GetJsonAsync<T>(HttpClient client, string url)
    {
        var resp = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        return (await resp.Content.ReadFromJsonAsync<T>(JsonOpts))!;
    }

    private static async Task SeedSessionsAsync(TestApiFactory factory, params SeedSession[] rows)
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

    private static async Task<Guid> SeedOneEndedSessionAsync(TestApiFactory factory)
    {
        var id = Guid.NewGuid();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var t = DateTime.UtcNow;
        db.Sessions.Add(new Session
        {
            Id = id,
            StartedAt = t.AddHours(-2),
            EndedAt = t.AddHours(-1),
            EnergyWh = 7_000,
            RateAtStartCentsPerKwh = 13,
            CostCents = 91,
            PeakKw = 7.1m,
            DurationSeconds = 3600,
            IsMerged = false,
        });
        await db.SaveChangesAsync();
        return id;
    }

    private static async Task<Guid> SeedOneActiveSessionAsync(TestApiFactory factory)
    {
        var id = Guid.NewGuid();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Sessions.Add(new Session
        {
            Id = id,
            StartedAt = DateTime.UtcNow.AddMinutes(-15),
            EndedAt = null,
            EnergyWh = 1_000,
            RateAtStartCentsPerKwh = 13,
            CostCents = 13,
            PeakKw = 7.0m,
            DurationSeconds = 0,
            IsMerged = false,
        });
        await db.SaveChangesAsync();
        return id;
    }
}
