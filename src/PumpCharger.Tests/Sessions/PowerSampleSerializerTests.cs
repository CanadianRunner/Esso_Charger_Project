using PumpCharger.Api.Services.Sessions;

namespace PumpCharger.Tests.Sessions;

public class PowerSampleSerializerTests
{
    [Fact]
    public void Append_to_null_produces_single_tuple_array()
    {
        var result = PowerSampleSerializer.Append(null, 1715472000, 7.234);
        Assert.Equal("[[1715472000,7.23]]", result);
    }

    [Fact]
    public void Append_to_empty_string_produces_single_tuple_array()
    {
        var result = PowerSampleSerializer.Append("", 1715472000, 7.0);
        Assert.Equal("[[1715472000,7]]", result);
    }

    [Fact]
    public void Append_to_existing_appends_new_tuple_in_order()
    {
        var first = PowerSampleSerializer.Append(null, 1715472000, 7.2);
        var second = PowerSampleSerializer.Append(first, 1715472010, 7.4);
        Assert.Equal("[[1715472000,7.2],[1715472010,7.4]]", second);
    }

    [Fact]
    public void Append_rounds_kw_to_two_decimals()
    {
        var result = PowerSampleSerializer.Append(null, 1715472000, 7.23456);
        Assert.Equal("[[1715472000,7.23]]", result);
    }

    [Fact]
    public void Append_recovers_from_corrupt_existing_value_by_starting_fresh()
    {
        var result = PowerSampleSerializer.Append("not-json", 1715472000, 5.0);
        Assert.Equal("[[1715472000,5]]", result);
    }

    [Fact]
    public void Parse_round_trips_a_two_sample_array()
    {
        var json = "[[1715472000,7.2],[1715472010,7.4]]";
        var samples = PowerSampleSerializer.Parse(json);
        Assert.Equal(2, samples.Count);
        Assert.Equal((1715472000L, 7.2), samples[0]);
        Assert.Equal((1715472010L, 7.4), samples[1]);
    }

    [Fact]
    public void Parse_returns_empty_for_null_empty_or_malformed()
    {
        Assert.Empty(PowerSampleSerializer.Parse(null));
        Assert.Empty(PowerSampleSerializer.Parse(""));
        Assert.Empty(PowerSampleSerializer.Parse("not-json"));
        Assert.Empty(PowerSampleSerializer.Parse("{\"not\":\"an array\"}"));
    }
}
