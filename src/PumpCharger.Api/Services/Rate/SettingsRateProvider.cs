using PumpCharger.Api.Services.Settings;
using PumpCharger.Core.Settings;

namespace PumpCharger.Api.Services.Rate;

public class SettingsRateProvider : ICurrentRateProvider
{
    private readonly ISettingsService _settings;
    private readonly int _fallbackCents;

    public SettingsRateProvider(ISettingsService settings, IConfiguration configuration)
    {
        _settings = settings;
        _fallbackCents = configuration.GetValue<int?>("Pump:DefaultRateCentsPerKwh") ?? 13;
    }

    public Task<int> GetCurrentRateCentsPerKwhAsync(CancellationToken ct = default) =>
        _settings.GetIntAsync(SettingKeys.RateFlatCentsPerKwh, _fallbackCents, ct);
}
