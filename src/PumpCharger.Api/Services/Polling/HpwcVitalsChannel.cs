using System.Threading.Channels;
using PumpCharger.Core.External.Models;

namespace PumpCharger.Api.Services.Polling;

public record TimedVitals(DateTime AtUtc, HpwcVitals Vitals);

public class HpwcVitalsChannel
{
    private readonly Channel<TimedVitals> _channel = Channel.CreateBounded<TimedVitals>(
        new BoundedChannelOptions(capacity: 64)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = true
        });

    public ChannelWriter<TimedVitals> Writer => _channel.Writer;
    public ChannelReader<TimedVitals> Reader => _channel.Reader;
}
