using System.Text.Json;
using System.Text.Json.Nodes;

namespace PumpCharger.Api.Services.Sessions;

/// <summary>
/// Storage format for the per-session power samples persisted to
/// <c>Session.PowerSamplesJson</c>: a JSON array of <c>[unixSecondsUtc, kW]</c>
/// tuples ordered by time. Compact (single line, no whitespace) so a long
/// session's samples don't bloat the row.
/// </summary>
public static class PowerSampleSerializer
{
    public static string Append(string? existing, long unixSecondsUtc, double kw)
    {
        JsonArray arr;
        if (string.IsNullOrWhiteSpace(existing))
        {
            arr = new JsonArray();
        }
        else
        {
            try
            {
                arr = JsonNode.Parse(existing) as JsonArray ?? new JsonArray();
            }
            catch (JsonException)
            {
                // Corrupt or non-array contents — start fresh rather than throwing.
                arr = new JsonArray();
            }
        }

        arr.Add(new JsonArray(
            JsonValue.Create(unixSecondsUtc),
            JsonValue.Create(Math.Round(kw, 2))));

        return arr.ToJsonString();
    }

    public static IReadOnlyList<(long UnixSecondsUtc, double Kw)> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Array.Empty<(long, double)>();
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array) return Array.Empty<(long, double)>();

            var list = new List<(long, double)>(doc.RootElement.GetArrayLength());
            foreach (var item in doc.RootElement.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Array || item.GetArrayLength() < 2) continue;
                list.Add((item[0].GetInt64(), item[1].GetDouble()));
            }
            return list;
        }
        catch (JsonException)
        {
            return Array.Empty<(long, double)>();
        }
    }
}
