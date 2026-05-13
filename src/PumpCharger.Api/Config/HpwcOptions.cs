namespace PumpCharger.Api.Config;

public enum ClientMode
{
    Real,
    Fake
}

public class HpwcOptions
{
    public const string SectionName = "Hpwc";

    public ClientMode Mode { get; set; } = ClientMode.Real;
    public string Host { get; set; } = string.Empty;
    public int PollIntervalActiveMs { get; set; } = 1000;
    public int PollIntervalIdleMs { get; set; } = 5000;
    public int TimeoutMs { get; set; } = 3000;
    public FakeHpwcOptions Fake { get; set; } = new();
}

/// <summary>
/// Options for the fake HPWC simulator. Time-related values are in sim-seconds;
/// <see cref="TimeAcceleration"/> on the simulator drives how fast sim-time
/// advances per real-second.
/// </summary>
public class FakeHpwcOptions
{
    public double TimeAcceleration { get; set; } = 1.0;
    public long InitialLifetimeWh { get; set; } = 1_234_500;

    // Power profile parameters.
    public double PeakKw { get; set; } = 10.0;
    public double TaperEndKw { get; set; } = 1.0;
    public double JitterAmplitudeKw { get; set; } = 0.3;

    // Session timing parameters (sim-seconds).
    public int PluggedHandshakeSeconds { get; set; } = 10;
    public int ChargingDurationSeconds { get; set; } = 900;
    public int RampSeconds { get; set; } = 30;
    public int TrickleSeconds { get; set; } = 30;
    public double TaperFraction { get; set; } = 0.25;
    public int SessionCompleteSeconds { get; set; } = 30;
}
