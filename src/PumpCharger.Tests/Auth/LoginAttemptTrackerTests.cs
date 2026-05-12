using PumpCharger.Api.Services.Auth;

namespace PumpCharger.Tests.Auth;

public class LoginAttemptTrackerTests
{
    private DateTime _now = new(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
    private LoginAttemptTracker NewTracker() => new(() => _now);

    [Fact]
    public void Fresh_ip_is_not_locked_out()
    {
        var t = NewTracker();
        Assert.False(t.IsLockedOut("1.2.3.4"));
    }

    [Fact]
    public void Four_failures_do_not_trigger_lockout()
    {
        var t = NewTracker();
        for (var i = 0; i < 4; i++) t.RecordFailure("1.2.3.4");
        Assert.False(t.IsLockedOut("1.2.3.4"));
    }

    [Fact]
    public void Fifth_failure_triggers_lockout_and_returns_threshold_signal()
    {
        var t = NewTracker();
        for (var i = 0; i < 4; i++)
            Assert.False(t.RecordFailure("1.2.3.4"));
        Assert.True(t.RecordFailure("1.2.3.4"));
        Assert.True(t.IsLockedOut("1.2.3.4"));
    }

    [Fact]
    public void Further_failures_during_lockout_do_not_re_signal_threshold()
    {
        var t = NewTracker();
        for (var i = 0; i < 5; i++) t.RecordFailure("1.2.3.4");
        Assert.True(t.IsLockedOut("1.2.3.4"));
        // Sixth and seventh failures: still locked out, but RecordFailure does
        // not signal "just crossed the threshold" again.
        Assert.False(t.RecordFailure("1.2.3.4"));
        Assert.False(t.RecordFailure("1.2.3.4"));
    }

    [Fact]
    public void Lockout_clears_after_window_expires()
    {
        var t = NewTracker();
        for (var i = 0; i < 5; i++) t.RecordFailure("1.2.3.4");
        Assert.True(t.IsLockedOut("1.2.3.4"));

        _now += TimeSpan.FromMinutes(16);  // past the 15-min window
        Assert.False(t.IsLockedOut("1.2.3.4"));
    }

    [Fact]
    public void Reset_clears_failures_immediately()
    {
        var t = NewTracker();
        for (var i = 0; i < 5; i++) t.RecordFailure("1.2.3.4");
        t.Reset("1.2.3.4");
        Assert.False(t.IsLockedOut("1.2.3.4"));
    }

    [Fact]
    public void Lockouts_are_per_ip()
    {
        var t = NewTracker();
        for (var i = 0; i < 5; i++) t.RecordFailure("1.1.1.1");
        Assert.True(t.IsLockedOut("1.1.1.1"));
        Assert.False(t.IsLockedOut("2.2.2.2"));
    }
}
