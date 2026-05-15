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

    [Theory]
    [InlineData("", true)]
    [InlineData("192.168.1.42", true)]
    [InlineData("hpwc.local", true)]
    [InlineData("2001:db8::1", true)]
    [InlineData("with space", false)]
    [InlineData("has\"quote", false)]
    [InlineData("has/slash", false)]
    public void Hpwc_host_accepts_hostnames_and_ip_literals_but_rejects_obvious_junk(string value, bool expectedOk)
    {
        var result = _v.Validate(SettingKeys.HpwcHost, value);
        Assert.Equal(expectedOk, result.Ok);
    }

    [Fact]
    public void Hpwc_host_rejects_overly_long_values()
    {
        var result = _v.Validate(SettingKeys.HpwcHost, new string('a', 300));
        Assert.False(result.Ok);
    }

    [Theory]
    [InlineData("500", true)]
    [InlineData("1000", true)]
    [InlineData("30000", true)]
    [InlineData("499", false)]
    [InlineData("30001", false)]
    [InlineData("0", false)]
    public void Hpwc_active_poll_interval_must_be_in_500_to_30000_ms(string value, bool expectedOk)
    {
        var result = _v.Validate(SettingKeys.HpwcPollIntervalActiveMs, value);
        Assert.Equal(expectedOk, result.Ok);
    }

    [Theory]
    [InlineData("500", true)]
    [InlineData("60000", true)]
    [InlineData("60001", false)]
    public void Hpwc_idle_poll_interval_allows_up_to_60s(string value, bool expectedOk)
    {
        var result = _v.Validate(SettingKeys.HpwcPollIntervalIdleMs, value);
        Assert.Equal(expectedOk, result.Ok);
    }
}
