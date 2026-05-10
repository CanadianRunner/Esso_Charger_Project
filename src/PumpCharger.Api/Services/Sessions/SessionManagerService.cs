using PumpCharger.Api.Services.Polling;

namespace PumpCharger.Api.Services.Sessions;

public class SessionManagerService : BackgroundService
{
    private readonly VitalsBus _bus;
    private readonly SessionDetector _detector;
    private readonly SessionStore _store;
    private readonly ILogger<SessionManagerService> _log;

    public SessionManagerService(
        VitalsBus bus,
        SessionDetector detector,
        SessionStore store,
        ILogger<SessionManagerService> log)
    {
        _bus = bus;
        _detector = detector;
        _store = store;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("SessionManagerService starting.");

        try
        {
            var adopted = await _store.RecoverActiveSessionAsync(stoppingToken);
            if (adopted is not null)
            {
                _detector.AdoptActiveSession(adopted.PeakKw, adopted.EnergyWh);
                _log.LogInformation("Adopted in-progress session {SessionId} on startup.", adopted.Id);
            }
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Failed to recover in-progress session on startup.");
        }

        var reader = _bus.Subscribe();
        try
        {
            await foreach (var timed in reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    var ev = _detector.Process(timed.Vitals, timed.AtUtc);
                    switch (ev.Action)
                    {
                        case SessionAction.Open:
                            await _store.OpenAsync(ev.AtUtc, stoppingToken);
                            break;
                        case SessionAction.Close:
                            await _store.CloseAsync(ev, stoppingToken);
                            break;
                        case SessionAction.None:
                            break;
                    }
                }
                catch (Exception ex)
                {
                    _log.LogError(ex, "SessionManagerService failed to process vitals.");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }

        _log.LogInformation("SessionManagerService stopping.");
    }
}
