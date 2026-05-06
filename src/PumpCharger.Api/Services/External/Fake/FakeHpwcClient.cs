using PumpCharger.Core.External;
using PumpCharger.Core.External.Models;

namespace PumpCharger.Api.Services.External.Fake;

public class FakeHpwcClient : IHpwcClient
{
    private readonly FakeHpwcSimulator _simulator;

    public FakeHpwcClient(FakeHpwcSimulator simulator)
    {
        _simulator = simulator;
    }

    public Task<HpwcVitals> GetVitalsAsync(CancellationToken cancellationToken = default)
    {
        ThrowIfFailing();
        var s = _simulator.CurrentSnapshot();

        var charging = s.LiveKw > 0;
        var voltageA = charging ? 120.5 : 120.2;
        var voltageB = charging ? 120.7 : 120.4;
        var totalKw = s.LiveKw;
        // Split current evenly across L1/L2.
        var current = charging ? totalKw * 1000.0 / (voltageA + voltageB) : 0.0;

        return Task.FromResult(new HpwcVitals
        {
            ContactorClosed = s.ContactorClosed,
            VehicleConnected = s.VehicleConnected,
            SessionS = s.SessionElapsedSeconds,
            SessionEnergyWh = s.SessionWh,
            GridV = 240.5,
            GridHz = 60.0,
            VoltageA = voltageA,
            VoltageB = voltageB,
            VoltageC = 0,
            CurrentAA = current,
            CurrentBA = current,
            CurrentCA = 0,
            RelayCoilV = s.ContactorClosed ? 12.1 : 0,
            PcbaTempC = charging ? 38.5 : 25.0,
            HandleTempC = charging ? 32.0 : 22.0,
            McuTempC = charging ? 42.0 : 28.0,
            EvseState = s.State switch
            {
                SimState.Idle => 0,
                SimState.Plugged or SimState.SessionComplete => 1,
                SimState.Charging or SimState.ChargingResumed => 4,
                SimState.CyclingPause => 5,
                _ => 0
            }
        });
    }

    public Task<HpwcLifetime> GetLifetimeAsync(CancellationToken cancellationToken = default)
    {
        ThrowIfFailing();
        var s = _simulator.CurrentSnapshot();

        return Task.FromResult(new HpwcLifetime
        {
            ContactorCycles = s.ContactorCycles,
            ContactorCyclesLoaded = s.ContactorCycles,
            AlertCount = 0,
            ThermalFoldbacks = 0,
            AvgStartupTemp = 22.0,
            ChargeStarts = s.ChargeStarts,
            EnergyWh = s.LifetimeWh,
            ConnectorCycles = s.ConnectorCycles,
            UptimeS = s.UptimeS,
            ChargingTimeS = s.ChargingTimeS
        });
    }

    public Task<HpwcVersion> GetVersionAsync(CancellationToken cancellationToken = default)
    {
        ThrowIfFailing();
        return Task.FromResult(new HpwcVersion
        {
            FirmwareVersion = "fake-24.20.1",
            PartNumber = "1529455-02-G",
            SerialNumber = "FAKE-0000-0001"
        });
    }

    public Task<HpwcWifiStatus> GetWifiStatusAsync(CancellationToken cancellationToken = default)
    {
        ThrowIfFailing();
        return Task.FromResult(new HpwcWifiStatus
        {
            Ssid = "fake-network",
            Connected = true,
            SignalDb = -54
        });
    }

    private void ThrowIfFailing()
    {
        if (_simulator.IsNetworkFailing)
        {
            throw new HttpRequestException("Simulated HPWC network failure.");
        }
    }
}
