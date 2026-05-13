using Microsoft.Extensions.Options;
using PumpCharger.Api.Config;
using PumpCharger.Core.External;

namespace PumpCharger.Api.Services.Polling;

public class HpwcPollerService : BackgroundService
{
    private readonly IHpwcClient _hpwc;
    private readonly VitalsBus _bus;
    private readonly PollerHealth _health;
    private readonly Func<DateTime> _clock;
    private readonly IOptionsMonitor<HpwcOptions> _options;
    private readonly ILogger<HpwcPollerService> _log;

    public HpwcPollerService(
        IHpwcClient hpwc,
        VitalsBus bus,
        PollerHealth health,
        Func<DateTime> clock,
        IOptionsMonitor<HpwcOptions> options,
        ILogger<HpwcPollerService> log)
    {
        _hpwc = hpwc;
        _bus = bus;
        _health = health;
        _clock = clock;
        _options = options;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("HpwcPollerService starting.");
        bool active = false;

        while (!stoppingToken.IsCancellationRequested)
        {
            var opts = _options.CurrentValue;
            try
            {
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                cts.CancelAfter(opts.TimeoutMs);

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

            var delay = NextDelay(active, _health.ConsecutiveFailures, opts);
            try { await Task.Delay(delay, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }

        _log.LogInformation("HpwcPollerService stopping.");
    }

    private static TimeSpan NextDelay(bool active, int failures, HpwcOptions opts)
    {
        // After 3 consecutive failures, back off to 30s.
        if (failures >= 3) return TimeSpan.FromSeconds(30);
        var ms = active ? opts.PollIntervalActiveMs : opts.PollIntervalIdleMs;
        return TimeSpan.FromMilliseconds(ms);
    }
}
