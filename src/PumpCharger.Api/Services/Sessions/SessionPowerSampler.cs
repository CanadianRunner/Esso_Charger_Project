using Microsoft.EntityFrameworkCore;
using PumpCharger.Api.Data;
using PumpCharger.Api.Services.Polling;
using PumpCharger.Api.Services.Settings;
using PumpCharger.Core.Settings;

namespace PumpCharger.Api.Services.Sessions;

/// <summary>
/// Subscribes to <see cref="VitalsBus"/> and appends a <c>[unixSecondsUtc, kW]</c>
/// sample to the active session's <c>PowerSamplesJson</c> at the cadence configured
/// by <see cref="SettingKeys.SessionPowerSampleIntervalSeconds"/>. Samples are only
/// taken while real power is flowing; idle/handshake periods reset the cadence so
/// the first sample after charging resumes lands immediately.
/// </summary>
public class SessionPowerSampler : BackgroundService
{
    // Power-flow threshold. Below this we treat the line as idle and skip the
    // sample. ~0.1 kW corresponds to <0.5A at typical 240V — below the
    // SessionDetector's idle threshold so we never sample noise during the
    // contactor-closed-but-no-current handshake window.
    public const double MinChargingKw = 0.1;

    private readonly VitalsBus _bus;
    private readonly SessionStore _store;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SessionPowerSampler> _log;

    private DateTime? _lastSampleAtUtc;

    public SessionPowerSampler(
        VitalsBus bus,
        SessionStore store,
        IServiceScopeFactory scopeFactory,
        ILogger<SessionPowerSampler> log)
    {
        _bus = bus;
        _store = store;
        _scopeFactory = scopeFactory;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("SessionPowerSampler starting.");
        var reader = _bus.Subscribe();
        try
        {
            await foreach (var timed in reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    await ProcessAsync(timed, stoppingToken);
                }
                catch (Exception ex)
                {
                    _log.LogError(ex, "SessionPowerSampler failed to process vitals.");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }

        _log.LogInformation("SessionPowerSampler stopping.");
    }

    /// <summary>
    /// Decide whether <paramref name="timed"/> should produce a power sample,
    /// and if so append it to the active session row. Exposed for direct test
    /// invocation; the hosted service drives this from VitalsBus.
    /// </summary>
    public async Task ProcessAsync(TimedVitals timed, CancellationToken ct)
    {
        if (timed.Vitals.LiveKw < MinChargingKw)
        {
            // Reset cadence so the first sample after charging resumes is immediate.
            _lastSampleAtUtc = null;
            return;
        }

        using var scope = _scopeFactory.CreateScope();
        var settings = scope.ServiceProvider.GetRequiredService<ISettingsService>();
        var intervalSeconds = await settings.GetIntAsync(
            SettingKeys.SessionPowerSampleIntervalSeconds, defaultValue: 10, ct);

        if (_lastSampleAtUtc is { } last && (timed.AtUtc - last).TotalSeconds < intervalSeconds)
            return;

        var activeId = _store.ActiveSessionId;
        if (activeId is null) return;

        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var session = await db.Sessions.FirstOrDefaultAsync(s => s.Id == activeId, ct);
        if (session is null) return;

        var unix = (long)Math.Floor((timed.AtUtc - DateTime.UnixEpoch).TotalSeconds);
        session.PowerSamplesJson = PowerSampleSerializer.Append(
            session.PowerSamplesJson, unix, timed.Vitals.LiveKw);
        await db.SaveChangesAsync(ct);

        _lastSampleAtUtc = timed.AtUtc;
    }
}
