using PumpCharger.Api.Services.Settings;
using PumpCharger.Core.Settings;

namespace PumpCharger.Tests.Admin;

public class SettingsValidatorTests
{
    private readonly SettingsValidator _v = new();

    [Theory]
    [InlineData("1", true)]
    [InlineData("60", true)]
    [InlineData("0", false)]    // below min
    [InlineData("601", false)]  // above max
    [InlineData("abc", false)]
    [InlineData("", false)]
    public void Mini_rotation_seconds_must_be_int_in_range(string value, bool expectedOk)
    {
        var result = _v.Validate(SettingKeys.DisplayMiniRotationSeconds, value);
        Assert.Equal(expectedOk, result.Ok);
    }

    [Theory]
    [InlineData("0", true)]
    [InlineData("0.5", true)]
    [InlineData("1", true)]
    [InlineData("1.0", true)]
    [InlineData("-0.1", false)]
    [InlineData("1.5", false)]
    [InlineData("abc", false)]
    public void Brightness_active_must_be_decimal_in_zero_to_one(string value, bool expectedOk)
    {
        var result = _v.Validate(SettingKeys.DisplayBrightnessActive, value);
        Assert.Equal(expectedOk, result.Ok);
    }

    [Theory]
    [InlineData("0", true)]
    [InlineData("12", true)]
    [InlineData("23", true)]
    [InlineData("24", false)]
    [InlineData("-1", false)]
    public void Overnight_hour_must_be_int_in_zero_to_23(string value, bool expectedOk)
    {
        var result = _v.Validate(SettingKeys.DisplayOvernightStartHour, value);
        Assert.Equal(expectedOk, result.Ok);
    }

    [Theory]
    [InlineData("0", true)]     // disabled — explicitly allowed
    [InlineData("300", true)]
    [InlineData("3600", true)]
    [InlineData("-1", false)]   // negative rejected
    [InlineData("86401", false)] // > 1 day rejected
    public void Dial_exercise_interval_allows_zero_and_positive_below_one_day(string value, bool expectedOk)
    {
        var result = _v.Validate(SettingKeys.DisplayDialExerciseIntervalSeconds, value);
        Assert.Equal(expectedOk, result.Ok);
    }

    [Fact]
    public void Unknown_key_is_rejected_with_explanatory_message()
    {
        var result = _v.Validate("some.unknown.key", "anything");
        Assert.False(result.Ok);
        Assert.Contains("not admin-editable", result.Error);
    }

    [Fact]
    public void Null_value_is_rejected()
    {
        var result = _v.Validate(SettingKeys.DisplayBrightnessActive, null);
        Assert.False(result.Ok);
    }

    [Fact]
    public void Validator_error_message_includes_a_human_label()
    {
        var result = _v.Validate(SettingKeys.DisplayBrightnessDim, "1.7");
        Assert.False(result.Ok);
        Assert.Contains("brightness", result.Error);
    }
}
