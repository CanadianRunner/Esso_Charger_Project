namespace PumpCharger.Core.Display;

public record PumpState
{
    public required string State { get; init; }                // see DisplayStateExtensions.ToWire()
    public PumpStateSession? Session { get; init; }
    public required PumpStateTotals Totals { get; init; }
    public required PumpStateRate Rate { get; init; }
    public required string ServerTime { get; init; }           // ISO 8601 UTC
    public required PumpStateHealth Health { get; init; }
    public required PumpStateDisplay Display { get; init; }
}

public record PumpStateDisplay
{
    public required int MiniRotationSeconds { get; init; }
    public required int PostSessionBrightSeconds { get; init; }
    public required int PostSessionDimSeconds { get; init; }
    public required double BrightnessActive { get; init; }
    public required double BrightnessDim { get; init; }
    public required double BrightnessOvernight { get; init; }
    public required int OvernightStartHour { get; init; }
    public required int OvernightEndHour { get; init; }
    public required int DialExerciseIntervalSeconds { get; init; }
}

public record PumpStateSession
{
    public required double EnergyKwh { get; init; }
    public required long DurationSeconds { get; init; }
    public required long CostCents { get; init; }
    public required double LiveKw { get; init; }
}

public record PumpStateTotals
{
    public required double LifetimeKwh { get; init; }
    public required double YearToDateKwh { get; init; }
    public required int SessionCount { get; init; }
}

public record PumpStateRate
{
    public required int CentsPerKwh { get; init; }
}

public record PumpStateHealth
{
    public required bool HpwcConnected { get; init; }
    public required bool ShellyConnected { get; init; }
    public required string RateSource { get; init; }
    public required string RateLastUpdated { get; init; }
}
