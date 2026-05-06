namespace PumpCharger.Core.External.Models;

public record HpwcVersion
{
    public string FirmwareVersion { get; init; } = string.Empty;
    public string PartNumber { get; init; } = string.Empty;
    public string SerialNumber { get; init; } = string.Empty;
}
