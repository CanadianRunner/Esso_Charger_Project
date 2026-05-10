namespace PumpCharger.Api.Services.Rate;

public interface ICurrentRateProvider
{
    Task<int> GetCurrentRateCentsPerKwhAsync(CancellationToken ct = default);
}
