namespace PumpCharger.Api.Config;

public class ShellyOptions
{
    public const string SectionName = "Shelly";

    public ClientMode Mode { get; set; } = ClientMode.Real;
    public bool Enabled { get; set; } = true;
    public string Host { get; set; } = string.Empty;
    public int PollIntervalMs { get; set; } = 5000;
    public int TimeoutMs { get; set; } = 3000;
}
