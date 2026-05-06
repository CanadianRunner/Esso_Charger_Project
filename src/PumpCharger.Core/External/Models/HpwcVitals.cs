namespace PumpCharger.Core.External.Models;

public record HpwcVitals
{
    public bool ContactorClosed { get; init; }
    public bool VehicleConnected { get; init; }
    public int SessionS { get; init; }
    public double SessionEnergyWh { get; init; }
    public double GridV { get; init; }
    public double GridHz { get; init; }
    public double VoltageA { get; init; }
    public double VoltageB { get; init; }
    public double VoltageC { get; init; }
    public double CurrentAA { get; init; }
    public double CurrentBA { get; init; }
    public double CurrentCA { get; init; }
    public double RelayCoilV { get; init; }
    public double PcbaTempC { get; init; }
    public double HandleTempC { get; init; }
    public double McuTempC { get; init; }
    public int EvseState { get; init; }

    public double LiveKw => (VoltageA * CurrentAA + VoltageB * CurrentBA) / 1000.0;
}
