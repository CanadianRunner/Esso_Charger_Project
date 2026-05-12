namespace PumpCharger.Api.Models.Admin;

public record DashboardResponse(
    IReadOnlyList<SessionSummary> RecentSessions,
    AggregatesDto Aggregates,
    HealthDto Health);

public record SessionSummary(
    Guid Id,
    DateTime StartedAt,
    DateTime? EndedAt,
    long DurationSeconds,
    double EnergyKwh,
    long CostCents,
    bool IsMerged);

public record AggregatesDto(
    double TodayKwh,
    double ThisMonthKwh,
    double ThisYearKwh);

public record HealthDto(
    DateTime? LastPollUtc,
    int ConsecutiveFailures,
    bool ControllerResponsive,
    bool VehicleConnected,
    bool ContactorClosed);
