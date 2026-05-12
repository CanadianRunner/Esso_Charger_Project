namespace PumpCharger.Api.Models.Admin;

public record SessionListResponse(
    IReadOnlyList<SessionSummary> Items,
    int TotalCount,
    int Page,
    int PageSize);

public record SessionDetailDto(
    Guid Id,
    DateTime StartedAt,
    DateTime? EndedAt,
    long DurationSeconds,
    double EnergyKwh,
    long CostCents,
    decimal PeakKw,
    int RateAtStartCentsPerKwh,
    bool IsMerged,
    string? Notes,
    IReadOnlyList<PowerSample> PowerSamples);

public record PowerSample(long UnixSecondsUtc, double Kw);

public record UpdateSessionRequest(string? Notes, bool? IsMerged);
