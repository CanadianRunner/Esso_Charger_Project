namespace PumpCharger.Core.Settings;

public static class SettingKeys
{
    public const string RateSource = "rate.source";                       // "manual" | "openei"
    public const string RateFlatCentsPerKwh = "rate.flat_cents_per_kwh";  // int
    public const string RateOpenEiApiKey = "rate.openei_api_key";         // string
    public const string RateOpenEiScheduleId = "rate.openei_schedule_id"; // string

    public const string SessionMergeGraceSeconds = "session.merge_grace_seconds";  // int, default 60
    public const string SessionIdleThresholdAmps = "session.idle_threshold_amps";  // decimal, default 0.5
    public const string SessionPowerSampleIntervalSeconds = "session.power_sample_interval_seconds";  // int, default 10

    public const string HpwcHost = "hpwc.host";
    public const string ShellyHost = "shelly.host";

    public const string LifetimeOffsetWh = "lifetime.offset_wh";  // long

    public const string DisplayMiniRotationSeconds = "display.mini_rotation_seconds";  // int, default 10
    public const string DisplayPostSessionBrightSeconds = "display.post_session_bright_seconds";  // int, default 300
    public const string DisplayPostSessionDimSeconds = "display.post_session_dim_seconds";        // int, default 600

    // Brightness factors stored as decimal strings (e.g. "0.6"), at most 2
    // decimal places. Frontend hooks parse and clamp to [0, 1] — CSS
    // filter:brightness() accepts >1 but produces washed-out artifacts on a
    // real display, so we cap at 1.0. The 7.4b Settings UI surfaces these as
    // percentages for user friendliness.
    public const string DisplayBrightnessActive = "display.brightness_active";        // decimal [0,1], default 1.0
    public const string DisplayBrightnessDim = "display.brightness_dim";              // decimal [0,1], default 0.6
    public const string DisplayBrightnessOvernight = "display.brightness_overnight";  // decimal [0,1], default 0.3

    // Overnight dimming window in local-time hours [0, 23]. Setting
    // start_hour == end_hour disables overnight dimming entirely — the 7.4b
    // Settings UI exposes this as an explicit "Enable overnight dimming"
    // toggle backed by this semantic. Otherwise the window may cross midnight
    // (start > end, e.g. 23 → 6) or stay within a calendar day (start < end).
    public const string DisplayOvernightStartHour = "display.overnight_start_hour";   // int [0,23], default 23
    public const string DisplayOvernightEndHour = "display.overnight_end_hour";       // int [0,23], default 6

    // Dial exercise (burn-in mitigation) interval in seconds during idle.
    // Setting this to 0 disables dial exercise entirely. Values 1..299 are
    // clamped to 300 in the hook to prevent dial-exercise spam.
    public const string DisplayDialExerciseIntervalSeconds = "display.dial_exercise_interval_seconds";  // int, default 3600

    public const string AdminPasswordHash = "admin.password_hash";  // BCrypt hash
}

public static class RateSourceValues
{
    public const string Manual = "manual";
    public const string OpenEi = "openei";
}
