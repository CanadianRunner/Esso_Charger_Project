using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PumpCharger.Api.Data;
using PumpCharger.Core.Settings;
using PumpCharger.Tests.Auth;

namespace PumpCharger.Tests.Admin;

public class AdminSettingsControllerTests
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private record SettingsResponseDto(IDictionary<string, string?> Values);

    [Fact]
    public async Task Unauthenticated_GET_returns_401()
    {
        await using var factory = new TestApiFactory();
        var client = factory.CreateClient();
        var resp = await client.GetAsync("/api/admin/settings");
        Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);
    }

    [Fact]
    public async Task GET_returns_seeded_defaults_for_all_whitelisted_keys()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);
        var resp = await client.GetAsync("/api/admin/settings");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var body = await resp.Content.ReadFromJsonAsync<SettingsResponseDto>(JsonOpts);
        Assert.NotNull(body);
        Assert.Equal("10", body!.Values[SettingKeys.DisplayMiniRotationSeconds]);
        Assert.Equal("1.0", body.Values[SettingKeys.DisplayBrightnessActive]);
        Assert.Equal("0.6", body.Values[SettingKeys.DisplayBrightnessDim]);
        Assert.Equal("23", body.Values[SettingKeys.DisplayOvernightStartHour]);
        Assert.Equal("3600", body.Values[SettingKeys.DisplayDialExerciseIntervalSeconds]);
    }

    [Fact]
    public async Task GET_never_exposes_admin_password_hash_even_if_present()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);
        var resp = await client.GetAsync("/api/admin/settings");
        var body = await resp.Content.ReadFromJsonAsync<SettingsResponseDto>(JsonOpts);
        Assert.NotNull(body);
        Assert.False(body!.Values.ContainsKey(SettingKeys.AdminPasswordHash));
    }

    [Fact]
    public async Task PATCH_with_valid_values_updates_and_returns_refreshed_payload()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);

        var resp = await client.PatchAsJsonAsync("/api/admin/settings", new
        {
            Values = new Dictionary<string, string>
            {
                [SettingKeys.DisplayBrightnessActive] = "0.85",
                [SettingKeys.DisplayOvernightStartHour] = "22",
            },
        });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        var body = await resp.Content.ReadFromJsonAsync<SettingsResponseDto>(JsonOpts);
        Assert.NotNull(body);
        Assert.Equal("0.85", body!.Values[SettingKeys.DisplayBrightnessActive]);
        Assert.Equal("22", body.Values[SettingKeys.DisplayOvernightStartHour]);
    }

    [Fact]
    public async Task PATCH_with_unknown_key_returns_400_and_does_not_write()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);

        // Capture the bcrypt hash set by AuthAsync's /auth/setup so we can
        // verify the PATCH rejection does not overwrite it.
        string? originalHash;
        using (var scope = factory.Services.CreateScope())
        {
            originalHash = (await scope.ServiceProvider.GetRequiredService<AppDbContext>()
                .Settings.FirstAsync(s => s.Key == SettingKeys.AdminPasswordHash)).Value;
        }

        var resp = await client.PatchAsJsonAsync("/api/admin/settings", new
        {
            Values = new Dictionary<string, string>
            {
                [SettingKeys.AdminPasswordHash] = "evil_attempt",
            },
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);

        using var scope2 = factory.Services.CreateScope();
        var db = scope2.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await db.Settings.FirstAsync(s => s.Key == SettingKeys.AdminPasswordHash);
        Assert.Equal(originalHash, row.Value);
    }

    [Fact]
    public async Task PATCH_with_invalid_value_returns_400_and_does_not_write()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);

        var resp = await client.PatchAsJsonAsync("/api/admin/settings", new
        {
            Values = new Dictionary<string, string>
            {
                [SettingKeys.DisplayBrightnessActive] = "2.5", // out of [0,1]
            },
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);

        // Confirm seeded default is unchanged.
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await db.Settings.FirstAsync(s => s.Key == SettingKeys.DisplayBrightnessActive);
        Assert.Equal("1.0", row.Value);
    }

    [Fact]
    public async Task PATCH_batch_with_mixed_valid_and_invalid_is_atomic_no_partial_writes()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);

        var resp = await client.PatchAsJsonAsync("/api/admin/settings", new
        {
            Values = new Dictionary<string, string>
            {
                [SettingKeys.DisplayBrightnessActive] = "0.85",  // would be valid
                [SettingKeys.DisplayOvernightStartHour] = "99",  // invalid (out of [0,23])
            },
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var active = await db.Settings.FirstAsync(s => s.Key == SettingKeys.DisplayBrightnessActive);
        Assert.Equal("1.0", active.Value);  // unchanged
    }

    [Fact]
    public async Task PATCH_writes_audit_log_entry_per_setting()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);

        await client.PatchAsJsonAsync("/api/admin/settings", new
        {
            Values = new Dictionary<string, string>
            {
                [SettingKeys.DisplayBrightnessDim] = "0.5",
            },
        });

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entries = await db.AuditLogs.Where(e => e.Action == "settings.update").ToListAsync();
        Assert.Contains(entries, e => e.Details.Contains(SettingKeys.DisplayBrightnessDim));
    }

    [Fact]
    public async Task PATCH_audit_log_includes_oldValue_and_newValue()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);

        await client.PatchAsJsonAsync("/api/admin/settings", new
        {
            Values = new Dictionary<string, string>
            {
                [SettingKeys.DisplayBrightnessDim] = "0.4",
            },
        });

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        // Latest entry for this key — earlier ones are seed writes which
        // legitimately have no oldValue.
        var entry = await db.AuditLogs
            .Where(e => e.Action == "settings.update" && e.Details.Contains(SettingKeys.DisplayBrightnessDim))
            .OrderByDescending(e => e.Timestamp)
            .FirstAsync();
        Assert.Contains("\"oldValue\":\"0.6\"", entry.Details);
        Assert.Contains("\"newValue\":\"0.4\"", entry.Details);
    }

    [Fact]
    public async Task Lifetime_change_without_reason_returns_400_and_does_not_write()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);

        var resp = await client.PatchAsJsonAsync("/api/admin/settings", new
        {
            Values = new Dictionary<string, string>
            {
                [SettingKeys.LifetimeOffsetWh] = "500000",
            },
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var row = await db.Settings.FirstAsync(s => s.Key == SettingKeys.LifetimeOffsetWh);
        Assert.Equal("0", row.Value);  // unchanged from default
    }

    [Fact]
    public async Task Lifetime_change_with_reason_writes_and_audits_with_reason()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);

        var resp = await client.PatchAsJsonAsync("/api/admin/settings", new
        {
            Values = new Dictionary<string, string>
            {
                [SettingKeys.LifetimeOffsetWh] = "500000",
            },
            Reason = "Adjustment to account for energy delivered before software installation",
        });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal("500000", (await db.Settings.FirstAsync(s => s.Key == SettingKeys.LifetimeOffsetWh)).Value);
        var entry = await db.AuditLogs
            .Where(e => e.Details.Contains(SettingKeys.LifetimeOffsetWh))
            .OrderByDescending(e => e.Timestamp)
            .FirstAsync();
        Assert.Contains("\"reason\":\"Adjustment to account for energy delivered before software installation\"", entry.Details);
        Assert.Contains("\"oldValue\":\"0\"", entry.Details);
        Assert.Contains("\"newValue\":\"500000\"", entry.Details);
    }

    [Fact]
    public async Task Reason_attaches_only_to_lifetime_entry_in_a_mixed_batch()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);

        var resp = await client.PatchAsJsonAsync("/api/admin/settings", new
        {
            Values = new Dictionary<string, string>
            {
                [SettingKeys.LifetimeOffsetWh] = "100",
                [SettingKeys.DisplayBrightnessDim] = "0.5",
            },
            Reason = "Reset offset after firmware upgrade",
        });
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var lifetimeEntry = await db.AuditLogs
            .Where(e => e.Action == "settings.update" && e.Details.Contains(SettingKeys.LifetimeOffsetWh))
            .OrderByDescending(e => e.Timestamp).FirstAsync();
        var brightnessEntry = await db.AuditLogs
            .Where(e => e.Action == "settings.update" && e.Details.Contains(SettingKeys.DisplayBrightnessDim))
            .OrderByDescending(e => e.Timestamp).FirstAsync();
        Assert.Contains("\"reason\":", lifetimeEntry.Details);
        Assert.DoesNotContain("\"reason\":", brightnessEntry.Details);
    }

    [Fact]
    public async Task Rejected_PATCH_writes_an_aggregated_audit_log_entry()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);

        var resp = await client.PatchAsJsonAsync("/api/admin/settings", new
        {
            Values = new Dictionary<string, string>
            {
                [SettingKeys.DisplayBrightnessActive] = "5.0",   // out of range
                [SettingKeys.DisplayOvernightStartHour] = "99",   // out of range
            },
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entries = await db.AuditLogs
            .Where(e => e.Action == "settings.update_rejected")
            .ToListAsync();
        Assert.Single(entries);
        var details = entries[0].Details;
        Assert.Contains(SettingKeys.DisplayBrightnessActive, details);
        Assert.Contains(SettingKeys.DisplayOvernightStartHour, details);
        // Both errors should be captured in the same entry.
        Assert.Contains("brightness", details);
        Assert.Contains("hour", details);
    }

    [Fact]
    public async Task Rejected_lifetime_without_reason_is_audited_as_rejection_with_the_specific_error()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);

        await client.PatchAsJsonAsync("/api/admin/settings", new
        {
            Values = new Dictionary<string, string>
            {
                [SettingKeys.LifetimeOffsetWh] = "500000",
            },
        });

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var entry = await db.AuditLogs.SingleAsync(e => e.Action == "settings.update_rejected");
        Assert.Contains(SettingKeys.LifetimeOffsetWh, entry.Details);
        Assert.Contains("reason", entry.Details, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Successful_PATCH_writes_no_settings_update_rejected_entry()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);

        await client.PatchAsJsonAsync("/api/admin/settings", new
        {
            Values = new Dictionary<string, string>
            {
                [SettingKeys.DisplayBrightnessDim] = "0.5",
            },
        });

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False(await db.AuditLogs.AnyAsync(e => e.Action == "settings.update_rejected"));
    }

    [Fact]
    public async Task PATCH_with_empty_body_returns_400()
    {
        await using var factory = new TestApiFactory();
        var client = await AuthAsync(factory);

        var resp = await client.PatchAsJsonAsync("/api/admin/settings", new
        {
            Values = new Dictionary<string, string>(),
        });
        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    private static async Task<HttpClient> AuthAsync(TestApiFactory factory)
    {
        var client = factory.CreateClient();
        await client.PostAsJsonAsync("/api/auth/setup", new { Password = "pw" });
        await client.PostAsJsonAsync("/api/auth/login", new { Password = "pw", RememberDevice = false });
        return client;
    }
}
