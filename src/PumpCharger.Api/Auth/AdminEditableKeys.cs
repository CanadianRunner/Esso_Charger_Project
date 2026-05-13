using PumpCharger.Core.Settings;

namespace PumpCharger.Api.Auth;

/// <summary>
/// Whitelist of <see cref="SettingKeys"/> values the admin Settings UI is
/// allowed to read and write. Keys not in this set are rejected on PATCH and
/// omitted from the GET response. Sensitive keys (e.g.
/// <see cref="SettingKeys.AdminPasswordHash"/>) must never appear here —
/// password changes go through their own dedicated endpoint with a
/// current-password challenge.
///
/// This whitelist grows tab-by-tab as Phase 7.4b commits add new tabs.
/// </summary>
public static class AdminEditableKeys
{
    /// <summary>Keys editable via the General tab.</summary>
    public static readonly IReadOnlySet<string> General = new HashSet<string>
    {
        SettingKeys.DisplayMiniRotationSeconds,
        SettingKeys.DisplayPostSessionBrightSeconds,
        SettingKeys.DisplayPostSessionDimSeconds,
        SettingKeys.DisplayBrightnessActive,
        SettingKeys.DisplayBrightnessDim,
        SettingKeys.DisplayBrightnessOvernight,
        SettingKeys.DisplayOvernightStartHour,
        SettingKeys.DisplayOvernightEndHour,
        SettingKeys.DisplayDialExerciseIntervalSeconds,
    };

    /// <summary>
    /// Aggregate of all keys editable across every tab. The controller
    /// validates that PATCH keys appear in this set; future tab commits add
    /// their categories to this aggregate.
    /// </summary>
    public static readonly IReadOnlySet<string> All = new HashSet<string>(General);
}
