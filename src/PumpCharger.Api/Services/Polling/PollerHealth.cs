namespace PumpCharger.Api.Services.Polling;

/// <summary>
/// Shared liveness signal for the HPWC poller. The poller writes; admin
/// surfaces (and any future health endpoints) read.
/// </summary>
public class PollerHealth
{
    private readonly object _lock = new();
    private DateTime? _lastSuccessfulPollUtc;
    private int _consecutiveFailures;

    public DateTime? LastSuccessfulPollUtc
    {
        get { lock (_lock) return _lastSuccessfulPollUtc; }
    }

    public int ConsecutiveFailures
    {
        get { lock (_lock) return _consecutiveFailures; }
    }

    public void RecordSuccess(DateTime atUtc)
    {
        lock (_lock)
        {
            _lastSuccessfulPollUtc = atUtc;
            _consecutiveFailures = 0;
        }
    }

    public void RecordFailure()
    {
        lock (_lock) _consecutiveFailures++;
    }
}
