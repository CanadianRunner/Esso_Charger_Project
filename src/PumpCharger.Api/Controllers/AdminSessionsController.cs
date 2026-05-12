using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PumpCharger.Api.Auth;
using PumpCharger.Api.Data;
using PumpCharger.Api.Models.Admin;
using PumpCharger.Api.Services.Sessions;
using PumpCharger.Core.Entities;

namespace PumpCharger.Api.Controllers;

[ApiController]
[Route("api/admin/sessions")]
[Authorize(Policy = AuthPolicies.AdminOnly)]
public class AdminSessionsController : ControllerBase
{
    private const int DefaultPageSize = 25;
    private const int MaxPageSize = 100;

    private readonly AppDbContext _db;
    private readonly Func<DateTime> _clock;

    public AdminSessionsController(AppDbContext db, Func<DateTime> clock)
    {
        _db = db;
        _clock = clock;
    }

    [HttpGet]
    public async Task<ActionResult<SessionListResponse>> List(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] bool? merged,
        [FromQuery] bool? active,
        [FromQuery] string sort = "started",
        [FromQuery] string dir = "desc",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = DefaultPageSize,
        CancellationToken ct = default)
    {
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > MaxPageSize) pageSize = DefaultPageSize;

        var q = _db.Sessions.AsNoTracking().AsQueryable();
        if (from.HasValue) q = q.Where(s => s.StartedAt >= from.Value);
        if (to.HasValue) q = q.Where(s => s.StartedAt <= to.Value);
        if (merged.HasValue) q = q.Where(s => s.IsMerged == merged.Value);
        if (active.HasValue)
        {
            q = active.Value
                ? q.Where(s => s.EndedAt == null)
                : q.Where(s => s.EndedAt != null);
        }

        q = ApplySort(q, sort, dir);

        var total = await q.CountAsync(ct);
        var items = await q
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new SessionSummary(
                s.Id,
                s.StartedAt,
                s.EndedAt,
                s.DurationSeconds,
                s.EnergyWh / 1000.0,
                s.CostCents,
                s.IsMerged))
            .ToListAsync(ct);

        return Ok(new SessionListResponse(items, total, page, pageSize));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<SessionDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var s = await _db.Sessions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (s is null) return NotFound();

        return Ok(MapDetail(s));
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateSessionRequest req, CancellationToken ct)
    {
        var s = await _db.Sessions.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (s is null) return NotFound();

        if (req.IsMerged.HasValue)
        {
            if (s.EndedAt is null)
                return BadRequest(new { error = "Available after session ends." });

            if (s.IsMerged != req.IsMerged.Value)
            {
                var old = s.IsMerged;
                s.IsMerged = req.IsMerged.Value;
                _db.AuditLogs.Add(new AuditLog
                {
                    Timestamp = _clock(),
                    Actor = "admin",
                    Action = "session.update_merged",
                    Details = $"{{\"sessionId\":\"{s.Id}\",\"old\":{old.ToString().ToLowerInvariant()},\"new\":{req.IsMerged.Value.ToString().ToLowerInvariant()}}}",
                });
            }
        }

        if (req.Notes is not null && req.Notes != s.Notes)
        {
            s.Notes = req.Notes;
            // Audit the event of notes being edited. Intentionally not logging
            // the notes content itself.
            _db.AuditLogs.Add(new AuditLog
            {
                Timestamp = _clock(),
                Actor = "admin",
                Action = "session.update_notes",
                Details = $"{{\"sessionId\":\"{s.Id}\"}}",
            });
        }

        await _db.SaveChangesAsync(ct);
        return Ok(MapDetail(s));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var s = await _db.Sessions.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (s is null) return NotFound();

        if (s.EndedAt is null)
            return BadRequest(new { error = "End the session before deleting." });

        _db.Sessions.Remove(s);
        _db.AuditLogs.Add(new AuditLog
        {
            Timestamp = _clock(),
            Actor = "admin",
            Action = "session.delete",
            Details = $"{{\"sessionId\":\"{s.Id}\",\"startedAt\":\"{s.StartedAt:o}\",\"energyWh\":{s.EnergyWh},\"costCents\":{s.CostCents}}}",
        });

        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    private static IQueryable<Session> ApplySort(IQueryable<Session> q, string? sort, string? dir)
    {
        var desc = !string.Equals(dir, "asc", StringComparison.OrdinalIgnoreCase);
        return sort?.ToLowerInvariant() switch
        {
            "duration" => desc ? q.OrderByDescending(s => s.DurationSeconds) : q.OrderBy(s => s.DurationSeconds),
            "energy"   => desc ? q.OrderByDescending(s => s.EnergyWh) : q.OrderBy(s => s.EnergyWh),
            "cost"     => desc ? q.OrderByDescending(s => s.CostCents) : q.OrderBy(s => s.CostCents),
            _          => desc ? q.OrderByDescending(s => s.StartedAt) : q.OrderBy(s => s.StartedAt),
        };
    }

    private static SessionDetailDto MapDetail(Session s)
    {
        var parsed = PowerSampleSerializer.Parse(s.PowerSamplesJson);
        var samples = parsed.Select(t => new PowerSample(t.UnixSecondsUtc, t.Kw)).ToList();
        return new SessionDetailDto(
            s.Id,
            s.StartedAt,
            s.EndedAt,
            s.DurationSeconds,
            s.EnergyWh / 1000.0,
            s.CostCents,
            s.PeakKw,
            s.RateAtStartCentsPerKwh,
            s.IsMerged,
            s.Notes,
            samples);
    }
}
