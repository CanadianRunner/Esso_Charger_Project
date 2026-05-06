using Microsoft.Extensions.Options;
using PumpCharger.Api.Config;
using PumpCharger.Api.Services.External.Fake;
using PumpCharger.Api.Services.External.Real;
using PumpCharger.Core.External;

namespace PumpCharger.Api.Extensions;

public static class ExternalServicesExtensions
{
    public static IServiceCollection AddExternalClients(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.Configure<HpwcOptions>(configuration.GetSection(HpwcOptions.SectionName));
        services.Configure<ShellyOptions>(configuration.GetSection(ShellyOptions.SectionName));
        services.Configure<OpenEiOptions>(configuration.GetSection(OpenEiOptions.SectionName));

        var hpwc = configuration.GetSection(HpwcOptions.SectionName).Get<HpwcOptions>() ?? new HpwcOptions();
        var shelly = configuration.GetSection(ShellyOptions.SectionName).Get<ShellyOptions>() ?? new ShellyOptions();
        var openEi = configuration.GetSection(OpenEiOptions.SectionName).Get<OpenEiOptions>() ?? new OpenEiOptions();

        services.AddSingleton<Func<DateTime>>(_ => () => DateTime.UtcNow);

        if (hpwc.Mode == ClientMode.Fake)
        {
            services.AddSingleton(sp =>
            {
                var opts = sp.GetRequiredService<IOptions<HpwcOptions>>().Value.Fake;
                var clock = sp.GetRequiredService<Func<DateTime>>();
                return new FakeHpwcSimulator(opts, clock);
            });
            services.AddSingleton<IHpwcClient, FakeHpwcClient>();
        }
        else
        {
            services.AddSingleton<IHpwcClient, HpwcHttpClient>();
        }

        if (shelly.Mode == ClientMode.Fake)
        {
            services.AddSingleton<IShellyClient, FakeShellyClient>();
        }
        else
        {
            services.AddSingleton<IShellyClient>(sp =>
            {
                var opts = sp.GetRequiredService<IOptions<ShellyOptions>>().Value;
                return new ShellyHttpClient(opts);
            });
        }

        if (openEi.Mode == ClientMode.Fake)
        {
            services.AddSingleton<IOpenEiClient, FakeOpenEiClient>();
        }
        else
        {
            services.AddSingleton<IOpenEiClient>(sp =>
            {
                var opts = sp.GetRequiredService<IOptions<OpenEiOptions>>().Value;
                return new OpenEiHttpClient(opts);
            });
        }

        return services;
    }
}
