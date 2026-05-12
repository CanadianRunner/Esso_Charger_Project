using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PumpCharger.Api.Auth;
using PumpCharger.Api.Data;
using PumpCharger.Api.Models.Admin;
using PumpCharger.Api.Services.Polling;

namespace PumpCharger.Api.Controllers;

[ApiController]
[Route("api/admin/dashboard")]
[Authorize(Policy = AuthPolicies.AdminOnly)]
public class AdminDashboardController : ControllerBase
{
    private const int RecentSessionsLimit = 5;
    private static readonly TimeSpan ControllerResponsiveWindow = TimeSpan.FromMinutes(1);

    private readonly AppDbContext _db;
    private readonly PollerHealth _pollerHealth;
    private readonly VitalsBus _vitalsBus;
    private readonly Func<DateTime> _clock;

    public AdminDashboardController(
        AppDbContext db,
        PollerHealth pollerHealth,
        VitalsBus vitalsBus,
        Func<DateTime> clock)
    {
        _db = db;
        _pollerHealth = pollerHealth;
        _vitalsBus = vitalsBus;
        _clock = clock;
    }

    [HttpGet]
    public async Task<ActionResult<DashboardResponse>> Get(CancellationToken ct)
    {
        var now = _clock();
        var todayStart = new DateTime(now.Year, now.Month, now.Day, 0, 0, 0, DateTimeKind.Utc);
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var yearStart = new DateTime(now.Year, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        var recent = await _db.Sessions
            .AsNoTracking()
            .OrderByDescending(s => s.StartedAt)
            .Take(RecentSessionsLimit)
            .Select(s => new SessionSummary(
                s.Id,
                s.StartedAt,
                s.EndedAt,
                s.DurationSeconds,
                s.EnergyWh / 1000.0,
                s.CostCents,
                s.IsMerged))
            .ToListAsync(ct);

        // Aggregates count only ended sessions, matching the kiosk's YTD calculation.
        // Live in-progress energy is visible in the kiosk view above.
        var todayWh = await _db.Sessions
            .Where(s => s.EndedAt != null && s.StartedAt >= todayStart)
            .SumAsync(s => (long?)s.EnergyWh, ct) ?? 0;
        var monthWh = await _db.Sessions
            .Where(s => s.EndedAt != null && s.StartedAt >= monthStart)
            .SumAsync(s => (long?)s.EnergyWh, ct) ?? 0;
        var yearWh = await _db.Sessions
            .Where(s => s.EndedAt != null && s.StartedAt >= yearStart)
            .SumAsync(s => (long?)s.EnergyWh, ct) ?? 0;

        var aggregates = new AggregatesDto(
            todayWh / 1000.0,
            monthWh / 1000.0,
            yearWh / 1000.0);

        var lastPoll = _pollerHealth.LastSuccessfulPollUtc;
        var responsive = lastPoll is not null && (now - lastPoll.Value) <= ControllerResponsiveWindow;
        var latest = _vitalsBus.Latest;
        var health = new HealthDto(
            lastPoll,
            _pollerHealth.ConsecutiveFailures,
            responsive,
            latest?.Vitals.VehicleConnected ?? false,
            latest?.Vitals.ContactorClosed ?? false);

        return Ok(new DashboardResponse(recent, aggregates, health));
    }
}
