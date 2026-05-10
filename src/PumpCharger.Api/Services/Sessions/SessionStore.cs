using Microsoft.EntityFrameworkCore;
using PumpCharger.Api.Data;
using PumpCharger.Api.Services.Rate;
using PumpCharger.Api.Services.Settings;
using PumpCharger.Core.Entities;
using PumpCharger.Core.Settings;

namespace PumpCharger.Api.Services.Sessions;

public record AdoptedSession(Guid Id, DateTime StartedAt, decimal PeakKw, long EnergyWh);

public class SessionStore
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SessionStore> _log;

    private Guid? _activeSessionId;
    private readonly object _lock = new();

    public SessionStore(IServiceScopeFactory scopeFactory, ILogger<SessionStore> log)
    {
        _scopeFactory = scopeFactory;
        _log = log;
    }

    public Guid? ActiveSessionId
    {
        get { lock (_lock) return _activeSessionId; }
    }

    /// <summary>
    /// Look for any session left open by a prior process (EndedAt is null) and adopt it.
    /// Returns null if no in-progress session exists.
    /// </summary>
    public async Task<AdoptedSession?> RecoverActiveSessionAsync(CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var open = await db.Sessions
            .AsNoTracking()
            .Where(s => s.EndedAt == null)
            .OrderByDescending(s => s.StartedAt)
            .FirstOrDefaultAsync(ct);

        if (open is null) return null;

        lock (_lock) _activeSessionId = open.Id;
        _log.LogInformation("Recovered in-progress session {SessionId} started at {StartedAt}",
            open.Id, open.StartedAt);

        return new AdoptedSession(open.Id, open.StartedAt, open.PeakKw, open.EnergyWh);
    }

    public async Task OpenAsync(DateTime at, CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var settings = scope.ServiceProvider.GetRequiredService<ISettingsService>();
        var rate = scope.ServiceProvider.GetRequiredService<ICurrentRateProvider>();

        var graceSeconds = await settings.GetIntAsync(SettingKeys.SessionMergeGraceSeconds, 60, ct);
        var graceCutoff = at.AddSeconds(-graceSeconds);

        var prior = await db.Sessions
            .Where(s => s.EndedAt != null && s.EndedAt > graceCutoff)
            .OrderByDescending(s => s.EndedAt)
            .FirstOrDefaultAsync(ct);

        if (prior is not null)
        {
            var priorEndedAt = prior.EndedAt;
            prior.EndedAt = null;
            prior.IsMerged = true;
            db.AuditLogs.Add(new AuditLog
            {
                Timestamp = at,
                Actor = "system",
                Action = "session.merge",
                Details = $"{{\"sessionId\":\"{prior.Id}\",\"priorEndedAt\":\"{priorEndedAt:o}\",\"reopenedAt\":\"{at:o}\"}}"
            });
            await db.SaveChangesAsync(ct);

            lock (_lock) _activeSessionId = prior.Id;
            _log.LogInformation(
                "Merged into prior session {SessionId} (gap {Gap:F1}s within grace {Grace}s)",
                prior.Id, (at - priorEndedAt!.Value).TotalSeconds, graceSeconds);
            return;
        }

        var rateCents = await rate.GetCurrentRateCentsPerKwhAsync(ct);
        var fresh = new Session
        {
            Id = Guid.NewGuid(),
            StartedAt = at,
            EndedAt = null,
            EnergyWh = 0,
            RateAtStartCentsPerKwh = rateCents,
            CostCents = 0,
            PeakKw = 0,
            DurationSeconds = 0,
            IsMerged = false
        };
        db.Sessions.Add(fresh);
        await db.SaveChangesAsync(ct);

        lock (_lock) _activeSessionId = fresh.Id;
        _log.LogInformation("Opened session {SessionId} at rate {RateCents}¢/kWh", fresh.Id, rateCents);
    }

    public async Task CloseAsync(SessionEvent close, CancellationToken ct = default)
    {
        if (close.Action != SessionAction.Close)
            throw new ArgumentException("CloseAsync requires a Close event.", nameof(close));

        Guid? id;
        lock (_lock) id = _activeSessionId;
        if (id is null)
        {
            _log.LogWarning("CloseAsync called with no active session.");
            return;
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var session = await db.Sessions.FirstOrDefaultAsync(s => s.Id == id, ct);
        if (session is null)
        {
            _log.LogWarning("Active session {SessionId} no longer exists in DB.", id);
            lock (_lock) _activeSessionId = null;
            return;
        }

        var addedEnergyWh = close.SessionEnergyWh ?? 0;
        var newPeak = close.PeakKw ?? 0m;

        // Merged sessions accumulate energy across physical connections;
        // fresh sessions overwrite (the row was created with EnergyWh=0).
        if (session.IsMerged)
            session.EnergyWh += addedEnergyWh;
        else
            session.EnergyWh = addedEnergyWh;

        if (newPeak > session.PeakKw) session.PeakKw = newPeak;

        session.EndedAt = close.AtUtc;
        session.DurationSeconds = (long)(close.AtUtc - session.StartedAt).TotalSeconds;
        // Wh × (cents/kWh) ÷ (Wh/kWh) = cents.  (Spec text says /100_000 but the math is /1_000.)
        session.CostCents = session.EnergyWh * session.RateAtStartCentsPerKwh / 1_000;

        await db.SaveChangesAsync(ct);

        lock (_lock) _activeSessionId = null;
        _log.LogInformation(
            "Closed session {SessionId}: {EnergyWh}Wh, peak {PeakKw}kW, {DurationSeconds}s, {CostCents}¢ (merged={Merged})",
            session.Id, session.EnergyWh, session.PeakKw, session.DurationSeconds, session.CostCents, session.IsMerged);
    }
}
