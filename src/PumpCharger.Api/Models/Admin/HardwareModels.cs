namespace PumpCharger.Api.Models.Admin;

public record TestHardwareRequest(string Host);

public record HardwareTestResponse(
    bool Success,
    long LatencyMs,
    string? Error,
    IReadOnlyDictionary<string, string>? Details);

public record HardwareInfoResponse(ClientInfo Hpwc, ClientInfo Shelly);

public record ClientInfo(string Mode, bool? Enabled);
