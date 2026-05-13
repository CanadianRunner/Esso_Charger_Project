using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PumpCharger.Api.Auth;
using PumpCharger.Api.Models.Admin;
using PumpCharger.Api.Services.Settings;

namespace PumpCharger.Api.Controllers;

[ApiController]
[Route("api/admin/settings")]
[Authorize(Policy = AuthPolicies.AdminOnly)]
public class AdminSettingsController : ControllerBase
{
    private readonly ISettingsService _settings;
    private readonly SettingsValidator _validator;

    public AdminSettingsController(ISettingsService settings, SettingsValidator validator)
    {
        _settings = settings;
        _validator = validator;
    }

    /// <summary>
    /// Return current values for every admin-editable setting. Keys not in the
    /// <see cref="AdminEditableKeys.All"/> whitelist are never exposed, even if
    /// they exist in the settings table.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<SettingsResponse>> Get(CancellationToken ct)
    {
        var values = new Dictionary<string, string?>();
        foreach (var key in AdminEditableKeys.All)
        {
            values[key] = await _settings.GetAsync(key, ct);
        }
        return Ok(new SettingsResponse(values));
    }

    /// <summary>
    /// Apply a batch of setting updates. The request body is an object whose
    /// keys must all be in <see cref="AdminEditableKeys.All"/>; values are
    /// validated per-key via <see cref="SettingsValidator"/>. The whole batch
    /// is rejected (no partial writes) when any key is unknown or any value
    /// fails validation, with a 400 response listing all problems so the
    /// client can surface them inline.
    /// </summary>
    [HttpPatch]
    public async Task<IActionResult> Patch([FromBody] UpdateSettingsRequest req, CancellationToken ct)
    {
        if (req?.Values is null || req.Values.Count == 0)
            return BadRequest(new { error = "Request body must include at least one setting." });

        var errors = new List<SettingsValidationError>();
        foreach (var (key, value) in req.Values)
        {
            if (!AdminEditableKeys.All.Contains(key))
            {
                errors.Add(new SettingsValidationError(key, "Setting is not admin-editable."));
                continue;
            }
            var result = _validator.Validate(key, value);
            if (!result.Ok)
            {
                errors.Add(new SettingsValidationError(key, result.Error ?? "Invalid value."));
            }
        }

        if (errors.Count > 0)
        {
            return BadRequest(new { errors });
        }

        // All validated — apply writes. SettingsService.SetAsync writes its
        // own audit log entry per change.
        foreach (var (key, value) in req.Values)
        {
            await _settings.SetAsync(key, value, actor: "admin", ct);
        }

        // Return the refreshed snapshot so the client can update its draft state.
        var refreshed = new Dictionary<string, string?>();
        foreach (var key in AdminEditableKeys.All)
        {
            refreshed[key] = await _settings.GetAsync(key, ct);
        }
        return Ok(new SettingsResponse(refreshed));
    }
}
