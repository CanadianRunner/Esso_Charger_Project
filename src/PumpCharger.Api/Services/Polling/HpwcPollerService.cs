using Microsoft.Extensions.Options;
using PumpCharger.Api.Config;
using PumpCharger.Core.External;

namespace PumpCharger.Api.Services.Polling;

public class HpwcPollerService : BackgroundService
{
    private readonly IHpwcClient _hpwc;
    private readonly VitalsBus _bus;
    private readonly IOptionsMonitor<HpwcOptions> _options;
    private readonly ILogger<HpwcPollerService> _log;

    private int _consecutiveFailures;

    public HpwcPollerService(
        IHpwcClient hpwc,
        VitalsBus bus,
        IOptionsMonitor<HpwcOptions> options,
        ILogger<HpwcPollerService> log)
    {
        _hpwc = hpwc;
        _bus = bus;
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
                _consecutiveFailures = 0;

                active = vitals.VehicleConnected;
                await _bus.PublishAsync(new TimedVitals(DateTime.UtcNow, vitals), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _consecutiveFailures++;
                if (_consecutiveFailures == 1 || _consecutiveFailures % 10 == 0)
                {
                    _log.LogWarning(ex, "HPWC poll failed (consecutive failures: {Count})", _consecutiveFailures);
                }
            }

            var delay = NextDelay(active, _consecutiveFailures, opts);
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
