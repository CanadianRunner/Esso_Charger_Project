using System.Threading.Channels;
using PumpCharger.Core.External.Models;

namespace PumpCharger.Api.Services.Polling;

public record TimedVitals(DateTime AtUtc, HpwcVitals Vitals);

/// <summary>
/// Single-publisher / multi-subscriber fanout for HPWC vitals. Each subscriber
/// gets its own bounded channel that drops oldest on overflow, so a slow consumer
/// can't backpressure the publisher or other subscribers.
/// </summary>
public class VitalsBus
{
    private readonly List<Channel<TimedVitals>> _subscribers = new();
    private readonly object _lock = new();
    private TimedVitals? _latest;

    public TimedVitals? Latest
    {
        get { lock (_lock) return _latest; }
    }

    public ChannelReader<TimedVitals> Subscribe(int capacity = 64)
    {
        var ch = Channel.CreateBounded<TimedVitals>(new BoundedChannelOptions(capacity)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = true
        });
        lock (_lock) _subscribers.Add(ch);
        return ch.Reader;
    }

    public async Task PublishAsync(TimedVitals vitals, CancellationToken ct = default)
    {
        Channel<TimedVitals>[] snapshot;
        lock (_lock)
        {
            _latest = vitals;
            snapshot = _subscribers.ToArray();
        }

        foreach (var ch in snapshot)
        {
            await ch.Writer.WriteAsync(vitals, ct);
        }
    }
}
