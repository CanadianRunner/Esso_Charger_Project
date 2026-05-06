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

public class FakeHpwcOptions
{
    public double TimeAcceleration { get; set; } = 1.0;
    public long InitialLifetimeWh { get; set; } = 1_234_500;
    public double ChargeKw { get; set; } = 10.0;

    public int IdleSeconds { get; set; } = 30;
    public int PluggedHandshakeSeconds { get; set; } = 5;
    public int FirstChargeSeconds { get; set; } = 300;
    public int CyclingPauseSeconds { get; set; } = 30;
    public int SecondChargeSeconds { get; set; } = 60;
    public int SessionCompleteSeconds { get; set; } = 15;
}
