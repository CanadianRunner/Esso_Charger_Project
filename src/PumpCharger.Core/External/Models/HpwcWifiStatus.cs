namespace PumpCharger.Core.External.Models;

public record HpwcWifiStatus
{
    public string Ssid { get; init; } = string.Empty;
    public bool Connected { get; init; }
    public int SignalDb { get; init; }
}
