using System.Collections.Concurrent;

namespace PumpCharger.Api.Services.Auth;

/// <summary>
/// Sliding-window per-IP failure tracker for the login endpoint. Spec: 5 failed
/// attempts in 15 minutes triggers a 15-minute lockout. Modeled as a single
/// 15-minute window — a 6th attempt is rejected, and the window slides forward
/// as old failures age out. A successful login clears the failure list for that IP.
/// </summary>
public class LoginAttemptTracker
{
    public const int MaxAttempts = 5;
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(15);

    private readonly ConcurrentDictionary<string, List<DateTime>> _failures = new();
    private readonly Func<DateTime> _clock;

    public LoginAttemptTracker(Func<DateTime> clock)
    {
        _clock = clock;
    }

    public bool IsLockedOut(string ip)
    {
        if (!_failures.TryGetValue(ip, out var list)) return false;
        var cutoff = _clock() - Window;
        lock (list)
        {
            list.RemoveAll(t => t < cutoff);
            return list.Count >= MaxAttempts;
        }
    }

    /// <summary>
    /// Records a failed attempt for the given IP. Returns true if this attempt
    /// is the one that pushed the IP across the lockout threshold (so the caller
    /// can write a one-time audit log entry rather than logging on every attempt).
    /// </summary>
    public bool RecordFailure(string ip)
    {
        var now = _clock();
        var cutoff = now - Window;
        var list = _failures.GetOrAdd(ip, _ => new List<DateTime>());
        lock (list)
        {
            list.RemoveAll(t => t < cutoff);
            var wasLocked = list.Count >= MaxAttempts;
            list.Add(now);
            return !wasLocked && list.Count >= MaxAttempts;
        }
    }

    public void Reset(string ip)
    {
        _failures.TryRemove(ip, out _);
    }
}
