namespace PumpCharger.Api.Services.External.Fake;

/// <summary>
/// Sim-time clock used by the fake-HPWC stack so that everything downstream
/// (poller, session store, sampler, audit log timestamps, dashboard period
/// boundaries) sees a consistent simulated time frame. Time advances at
/// <c>acceleration</c> seconds per real second; an <c>acceleration</c> of 1.0
/// makes sim-time identical to real-time.
///
/// In production (Mode=Real) this clock is not registered; the DI container
/// resolves <c>Func&lt;DateTime&gt;</c> directly to <c>DateTime.UtcNow</c>.
///
/// Cross-restart limitation: the sim epoch is anchored to backend startup, so
/// sessions from prior runs may appear in the future relative to a fresh
/// sim-clock. See CLAUDE.md for the bounded persistence-fix path if this ever
/// becomes a real annoyance.
/// </summary>
public class SimulatedClock
{
    private readonly DateTime _realStartedAtUtc;
    private readonly double _acceleration;

    public SimulatedClock(double acceleration)
    {
        _realStartedAtUtc = DateTime.UtcNow;
        _acceleration = acceleration;
    }

    public DateTime UtcNow()
    {
        var realElapsed = DateTime.UtcNow - _realStartedAtUtc;
        return _realStartedAtUtc + TimeSpan.FromTicks((long)(realElapsed.Ticks * _acceleration));
    }
}
