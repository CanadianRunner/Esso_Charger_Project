using PumpCharger.Api.Services.Settings;
using PumpCharger.Core.External;
using PumpCharger.Core.Settings;

namespace PumpCharger.Api.Services.Polling;

/// <summary>
/// Polls the HPWC for vitals on a configurable cadence and publishes the
/// result through <see cref="VitalsBus"/>. Poll intervals (active / idle) and
/// per-request timeout read live from the settings table so the admin
/// Hardware tab can tune them without a backend restart.
/// </summary>
public class HpwcPollerService : BackgroundService
{
    private const int DefaultPollIntervalActiveMs = 1000;
    private const int DefaultPollIntervalIdleMs = 5000;
    private const int DefaultTimeoutMs = 3000;

    private readonly IHpwcClient _hpwc;
    private readonly VitalsBus _bus;
    private readonly PollerHealth _health;
    private readonly Func<DateTime> _clock;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<HpwcPollerService> _log;

    public HpwcPollerService(
        IHpwcClient hpwc,
        VitalsBus bus,
        PollerHealth health,
        Func<DateTime> clock,
        IServiceScopeFactory scopeFactory,
        ILogger<HpwcPollerService> log)
    {
        _hpwc = hpwc;
        _bus = bus;
        _health = health;
        _clock = clock;
        _scopeFactory = scopeFactory;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("HpwcPollerService starting.");
        bool active = false;

        while (!stoppingToken.IsCancellationRequested)
        {
            var (timeoutMs, pollActiveMs, pollIdleMs) = await ReadTimingsAsync(stoppingToken);
            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                cts.CancelAfter(timeoutMs);

                var vitals = await _hpwc.GetVitalsAsync(cts.Token);
                var pollAt = _clock();
                _health.RecordSuccess(pollAt);

                active = vitals.VehicleConnected;
                await _bus.PublishAsync(new TimedVitals(pollAt, vitals), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _health.RecordFailure();
                var failures = _health.ConsecutiveFailures;
                if (failures == 1 || failures % 10 == 0)
                {
                    _log.LogWarning(ex, "HPWC poll failed (consecutive failures: {Count})", failures);
                }
            }

            var delay = NextDelay(active, _health.ConsecutiveFailures, pollActiveMs, pollIdleMs);
            try { await Task.Delay(delay, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }

        _log.LogInformation("HpwcPollerService stopping.");
    }

    private async Task<(int TimeoutMs, int PollActiveMs, int PollIdleMs)> ReadTimingsAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var settings = scope.ServiceProvider.GetRequiredService<ISettingsService>();
            var timeoutMs = await settings.GetIntAsync(SettingKeys.HpwcTimeoutMs, DefaultTimeoutMs, ct);
            var pollActiveMs = await settings.GetIntAsync(SettingKeys.HpwcPollIntervalActiveMs, DefaultPollIntervalActiveMs, ct);
            var pollIdleMs = await settings.GetIntAsync(SettingKeys.HpwcPollIntervalIdleMs, DefaultPollIntervalIdleMs, ct);
            return (timeoutMs, pollActiveMs, pollIdleMs);
        }
        catch
        {
            // If the settings read fails for any reason, fall back to defaults
            // rather than killing the poller.
            return (DefaultTimeoutMs, DefaultPollIntervalActiveMs, DefaultPollIntervalIdleMs);
        }
    }

    private static TimeSpan NextDelay(bool active, int failures, int pollActiveMs, int pollIdleMs)
    {
        // After 3 consecutive failures, back off to 30s.
        if (failures >= 3) return TimeSpan.FromSeconds(30);
        var ms = active ? pollActiveMs : pollIdleMs;
        return TimeSpan.FromMilliseconds(ms);
    }
}
