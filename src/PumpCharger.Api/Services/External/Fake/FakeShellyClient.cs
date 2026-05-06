using PumpCharger.Core.External;
using PumpCharger.Core.External.Models;

namespace PumpCharger.Api.Services.External.Fake;

public class FakeShellyClient : IShellyClient
{
    private readonly FakeHpwcSimulator _simulator;

    public FakeShellyClient(FakeHpwcSimulator simulator)
    {
        _simulator = simulator;
    }

    public bool IsConfigured => true;

    public Task<ShellyEmStatus> GetEmStatusAsync(CancellationToken cancellationToken = default)
    {
        var s = _simulator.CurrentSnapshot();
        var totalW = s.LiveKw * 1000;

        var aVoltage = s.LiveKw > 0 ? 120.4 : 120.1;
        var bVoltage = s.LiveKw > 0 ? 120.6 : 120.3;
        var aPower = totalW / 2;
        var bPower = totalW / 2;
        var aCurrent = aVoltage > 0 ? aPower / aVoltage : 0;
        var bCurrent = bVoltage > 0 ? bPower / bVoltage : 0;

        return Task.FromResult(new ShellyEmStatus
        {
            TotalActPower = totalW,
            TotalAprtPower = totalW * 1.02,
            AVoltage = aVoltage,
            ACurrent = aCurrent,
            AActPower = aPower,
            AAprtPower = aPower * 1.02,
            APf = 0.99,
            BVoltage = bVoltage,
            BCurrent = bCurrent,
            BActPower = bPower,
            BAprtPower = bPower * 1.02,
            BPf = 0.99,
            NCurrent = null
        });
    }

    public Task<ShellyEmDataStatus> GetEmDataStatusAsync(CancellationToken cancellationToken = default)
    {
        var s = _simulator.CurrentSnapshot();
        var total = (double)s.LifetimeWh;
        return Task.FromResult(new ShellyEmDataStatus
        {
            TotalAct = total,
            ATotalActEnergy = total / 2,
            BTotalActEnergy = total / 2
        });
    }
}
