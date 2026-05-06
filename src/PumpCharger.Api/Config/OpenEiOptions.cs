namespace PumpCharger.Api.Config;

public class OpenEiOptions
{
    public const string SectionName = "OpenEI";

    public ClientMode Mode { get; set; } = ClientMode.Real;
    public string ApiKey { get; set; } = string.Empty;
    public int TimeoutMs { get; set; } = 10000;
}
