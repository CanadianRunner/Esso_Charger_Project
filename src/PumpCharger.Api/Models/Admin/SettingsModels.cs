namespace PumpCharger.Api.Models.Admin;

public record SettingsResponse(IReadOnlyDictionary<string, string?> Values);

public record UpdateSettingsRequest(IReadOnlyDictionary<string, string> Values);

public record SettingsValidationError(string Key, string Error);
