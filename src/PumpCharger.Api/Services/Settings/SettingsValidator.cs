using System.Globalization;
using PumpCharger.Core.Settings;

namespace PumpCharger.Api.Services.Settings;

public record ValidationResult(bool Ok, string? Error = null)
{
    public static ValidationResult Success() => new(true);
    public static ValidationResult Fail(string message) => new(false, message);
}

/// <summary>
/// Per-key validation of values bound for the settings table. Lives as a
/// service so future bulk-import / migration paths can reuse the same rules
/// without duplicating logic.
///
/// Rules per key are declarative; the dispatcher in
/// <see cref="Validate"/> picks the right rule based on the key.
/// </summary>
public class SettingsValidator
{
    /// <summary>
    /// Validate a single (key, value) pair. Returns success or an error
    /// message suitable for surfacing to an admin user.
    /// </summary>
    public ValidationResult Validate(string key, string? value)
    {
        if (value is null) return ValidationResult.Fail("Value is required.");

        return key switch
        {
            // Display: rotation / linger timings — positive ints.
            SettingKeys.DisplayMiniRotationSeconds => IntInRange(value, 1, 600, "rotation seconds"),
            SettingKeys.DisplayPostSessionBrightSeconds => IntInRange(value, 0, 3600, "bright seconds"),
            SettingKeys.DisplayPostSessionDimSeconds => IntInRange(value, 0, 3600, "dim seconds"),

            // Display: brightness factors — decimal in [0, 1] with at most 2 decimal places.
            SettingKeys.DisplayBrightnessActive => DecimalInRange(value, 0m, 1m, "brightness"),
            SettingKeys.DisplayBrightnessDim => DecimalInRange(value, 0m, 1m, "brightness"),
            SettingKeys.DisplayBrightnessOvernight => DecimalInRange(value, 0m, 1m, "brightness"),

            // Display: overnight hours — int in [0, 23]. start == end is the
            // documented "disabled" semantic, so any value in range is valid.
            SettingKeys.DisplayOvernightStartHour => IntInRange(value, 0, 23, "hour"),
            SettingKeys.DisplayOvernightEndHour => IntInRange(value, 0, 23, "hour"),

            // Display: dial exercise interval — 0 disables; positive values
            // below 300 get clamped client-side. Reject negatives outright.
            SettingKeys.DisplayDialExerciseIntervalSeconds => IntInRange(value, 0, 86400, "interval seconds"),

            // Hardware: host strings allowed empty (means "not configured").
            // No deeper format check — hostnames and IPv4/IPv6 literals all
            // accepted; the test-connection endpoint will surface bad hosts
            // with concrete error messages.
            SettingKeys.HpwcHost => HostOrEmpty(value),
            SettingKeys.ShellyHost => HostOrEmpty(value),

            // Hardware: HPWC poller timings in milliseconds.
            SettingKeys.HpwcPollIntervalActiveMs => IntInRange(value, 500, 30_000, "active poll interval"),
            SettingKeys.HpwcPollIntervalIdleMs => IntInRange(value, 500, 60_000, "idle poll interval"),
            SettingKeys.HpwcTimeoutMs => IntInRange(value, 500, 30_000, "request timeout"),

            // Rate.
            SettingKeys.RateSource => OneOf(value, new[] { "manual", "openei" }, "rate source"),
            SettingKeys.RateFlatCentsPerKwh => IntInRange(value, 0, 1000, "flat rate"),
            // API key and schedule ID are free-form strings; empty is legal.
            SettingKeys.RateOpenEiApiKey => StringWithinLength(value, 256, "API key"),
            SettingKeys.RateOpenEiScheduleId => StringWithinLength(value, 256, "schedule ID"),

            // Session.
            SettingKeys.SessionMergeGraceSeconds => IntInRange(value, 0, 3600, "merge grace"),
            SettingKeys.SessionIdleThresholdAmps => DecimalInRange(value, 0m, 20m, "idle threshold"),
            // 0 disables; >0 is the sample interval in seconds, capped at 1 hour.
            SettingKeys.SessionPowerSampleIntervalSeconds => IntInRange(value, 0, 3600, "power sample interval"),

            // Lifetime offset: signed Wh. No practical bounds — adjustments at
            // home-charger scale fit comfortably inside Int64.
            SettingKeys.LifetimeOffsetWh => LongAny(value, "lifetime offset"),

            _ => ValidationResult.Fail($"Setting '{key}' is not admin-editable."),
        };
    }

    private static ValidationResult IntInRange(string value, int min, int max, string label)
    {
        if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var v))
            return ValidationResult.Fail($"'{value}' is not a valid integer for {label}.");
        if (v < min || v > max)
            return ValidationResult.Fail($"{label} must be between {min} and {max}.");
        return ValidationResult.Success();
    }

    private static ValidationResult OneOf(string value, string[] allowed, string label)
    {
        foreach (var a in allowed)
        {
            if (value == a) return ValidationResult.Success();
        }
        return ValidationResult.Fail($"{label} must be one of: {string.Join(", ", allowed)}.");
    }

    private static ValidationResult StringWithinLength(string value, int maxLength, string label)
    {
        if (value.Length > maxLength) return ValidationResult.Fail($"{label} is too long.");
        return ValidationResult.Success();
    }

    private static ValidationResult LongAny(string value, string label)
    {
        if (!long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out _))
            return ValidationResult.Fail($"'{value}' is not a valid integer for {label}.");
        return ValidationResult.Success();
    }

    private static ValidationResult HostOrEmpty(string value)
    {
        // Empty is acceptable ("not configured"). Otherwise reject only the
        // obvious problem characters; leave finer-grained validation to the
        // test-connection endpoint that actually tries to reach the host.
        if (value.Length == 0) return ValidationResult.Success();
        if (value.Length > 253) return ValidationResult.Fail("host is too long.");
        foreach (var c in value)
        {
            if (c <= ' ' || c == '"' || c == '\'' || c == '/' || c == '\\')
                return ValidationResult.Fail("host contains invalid characters.");
        }
        return ValidationResult.Success();
    }

    private static ValidationResult DecimalInRange(string value, decimal min, decimal max, string label)
    {
        if (!decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var v))
            return ValidationResult.Fail($"'{value}' is not a valid decimal for {label}.");
        if (v < min || v > max)
            return ValidationResult.Fail($"{label} must be between {min} and {max}.");
        return ValidationResult.Success();
    }
}
