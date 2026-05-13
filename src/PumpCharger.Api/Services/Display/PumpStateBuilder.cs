using Microsoft.EntityFrameworkCore;
using PumpCharger.Api.Data;
using PumpCharger.Api.Services.Settings;
using PumpCharger.Core.Display;
using PumpCharger.Core.External.Models;
using PumpCharger.Core.Settings;

namespace PumpCharger.Api.Services.Display;

public class PumpStateBuilder
{
    private readonly AppDbContext _db;
    private readonly ISettingsService _settings;

    public PumpStateBuilder(AppDbContext db, ISettingsService settings)
    {
        _db = db;
        _settings = settings;
    }

    public async Task<PumpState> BuildAsync(
        HpwcVitals vitals,
        HpwcLifetime lifetime,
        DateTime nowUtc,
        bool hpwcConnected,
        bool shellyConnected,
        CancellationToken ct = default)
    {
        var state = DisplayStateRules.From(vitals);

        var lifetimeOffset = await _settings.GetLongAsync(SettingKeys.LifetimeOffsetWh, 0, ct);
        var rateCents = await _settings.GetIntAsync(SettingKeys.RateFlatCentsPerKwh, 13, ct);
        var rateSource = await _settings.GetAsync(SettingKeys.RateSource, ct) ?? RateSourceValues.Manual;

        var miniRotationSeconds = await _settings.GetIntAsync(SettingKeys.DisplayMiniRotationSeconds, 10, ct);
        var postSessionBrightSeconds = await _settings.GetIntAsync(SettingKeys.DisplayPostSessionBrightSeconds, 300, ct);
        var postSessionDimSeconds = await _settings.GetIntAsync(SettingKeys.DisplayPostSessionDimSeconds, 600, ct);
        var brightnessActive = (double)await _settings.GetDecimalAsync(SettingKeys.DisplayBrightnessActive, 1.0m, ct);
        var brightnessDim = (double)await _settings.GetDecimalAsync(SettingKeys.DisplayBrightnessDim, 0.6m, ct);
        var brightnessOvernight = (double)await _settings.GetDecimalAsync(SettingKeys.DisplayBrightnessOvernight, 0.3m, ct);
        var overnightStartHour = await _settings.GetIntAsync(SettingKeys.DisplayOvernightStartHour, 23, ct);
        var overnightEndHour = await _settings.GetIntAsync(SettingKeys.DisplayOvernightEndHour, 6, ct);
        var dialExerciseIntervalSeconds = await _settings.GetIntAsync(SettingKeys.DisplayDialExerciseIntervalSeconds, 3600, ct);

        var ytdStart = new DateTime(nowUtc.Year, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        var ytdWh = await _db.Sessions
            .Where(s => s.EndedAt != null && s.StartedAt >= ytdStart)
            .SumAsync(s => (long?)s.EnergyWh, ct) ?? 0;

        var sessionCount = await _db.Sessions
            .Where(s => s.EndedAt != null)
            .CountAsync(ct);

        var active = await _db.Sessions
            .AsNoTracking()
            .Where(s => s.EndedAt == null)
            .OrderByDescending(s => s.StartedAt)
            .FirstOrDefaultAsync(ct);

        PumpStateSession? sessionPayload = null;
        if (active is not null)
        {
            // Active session row holds energy from prior merged segments; vitals carries
            // the current physical connection's accumulation. Sum gives the live display value.
            var displayedWh = active.EnergyWh + (long)vitals.SessionEnergyWh;
            var costCents = displayedWh * active.RateAtStartCentsPerKwh / 1_000;

            sessionPayload = new PumpStateSession
            {
                EnergyKwh = displayedWh / 1000.0,
                DurationSeconds = (long)(nowUtc - active.StartedAt).TotalSeconds,
                CostCents = costCents,
                LiveKw = vitals.LiveKw
            };
        }

        return new PumpState
        {
            State = state.ToWire(),
            Session = sessionPayload,
            Totals = new PumpStateTotals
            {
                LifetimeKwh = (lifetime.EnergyWh + lifetimeOffset) / 1000.0,
                YearToDateKwh = ytdWh / 1000.0,
                SessionCount = sessionCount
            },
            Rate = new PumpStateRate { CentsPerKwh = rateCents },
            ServerTime = nowUtc.ToString("o"),
            Health = new PumpStateHealth
            {
                HpwcConnected = hpwcConnected,
                ShellyConnected = shellyConnected,
                RateSource = rateSource,
                RateLastUpdated = nowUtc.ToString("o")
            },
            Display = new PumpStateDisplay
            {
                MiniRotationSeconds = miniRotationSeconds,
                PostSessionBrightSeconds = postSessionBrightSeconds,
                PostSessionDimSeconds = postSessionDimSeconds,
                BrightnessActive = brightnessActive,
                BrightnessDim = brightnessDim,
                BrightnessOvernight = brightnessOvernight,
                OvernightStartHour = overnightStartHour,
                OvernightEndHour = overnightEndHour,
                DialExerciseIntervalSeconds = dialExerciseIntervalSeconds,
            }
        };
    }
}
