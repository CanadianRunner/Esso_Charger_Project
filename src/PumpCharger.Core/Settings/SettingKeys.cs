namespace PumpCharger.Core.Settings;

public static class SettingKeys
{
    public const string RateSource = "rate.source";                       // "manual" | "openei"
    public const string RateFlatCentsPerKwh = "rate.flat_cents_per_kwh";  // int
    public const string RateOpenEiApiKey = "rate.openei_api_key";         // string
    public const string RateOpenEiScheduleId = "rate.openei_schedule_id"; // string

    public const string SessionMergeGraceSeconds = "session.merge_grace_seconds";  // int, default 60
    public const string SessionIdleThresholdAmps = "session.idle_threshold_amps";  // decimal, default 0.5

    public const string HpwcHost = "hpwc.host";
    public const string ShellyHost = "shelly.host";

    public const string LifetimeOffsetWh = "lifetime.offset_wh";  // long

    public const string DisplayMiniRotationSeconds = "display.mini_rotation_seconds";  // int, default 10
    public const string DisplayPostSessionBrightSeconds = "display.post_session_bright_seconds";  // int, default 300
    public const string DisplayPostSessionDimSeconds = "display.post_session_dim_seconds";        // int, default 600

    public const string AdminPasswordHash = "admin.password_hash";  // BCrypt hash
}

public static class RateSourceValues
{
    public const string Manual = "manual";
    public const string OpenEi = "openei";
}
