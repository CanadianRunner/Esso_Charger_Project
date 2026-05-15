using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PumpCharger.Api.Auth;
using PumpCharger.Api.Data;
using PumpCharger.Api.Services.Auth;
using PumpCharger.Api.Services.Settings;
using PumpCharger.Core.Entities;
using PumpCharger.Core.Settings;

namespace PumpCharger.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private const int RememberMeDays = 30;

    private readonly ISettingsService _settings;
    private readonly IPasswordHasher _hasher;
    private readonly LoginAttemptTracker _attempts;
    private readonly AppDbContext _db;
    private readonly ILogger<AuthController> _log;

    public AuthController(
        ISettingsService settings,
        IPasswordHasher hasher,
        LoginAttemptTracker attempts,
        AppDbContext db,
        ILogger<AuthController> log)
    {
        _settings = settings;
        _hasher = hasher;
        _attempts = attempts;
        _db = db;
        _log = log;
    }

    public record LoginRequest(string Password, bool RememberDevice);
    public record SetupRequest(string Password);

    [HttpGet("status")]
    public async Task<IActionResult> Status(CancellationToken ct)
    {
        var hash = await _settings.GetAsync(SettingKeys.AdminPasswordHash, ct);
        var hasPassword = !string.IsNullOrWhiteSpace(hash);
        var authed = User.Identity?.IsAuthenticated == true;
        return Ok(new { authed, hasPassword });
    }

    [HttpPost("setup")]
    public async Task<IActionResult> Setup([FromBody] SetupRequest req, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { error = "Password is required." });

        var existing = await _settings.GetAsync(SettingKeys.AdminPasswordHash, ct);
        if (!string.IsNullOrWhiteSpace(existing))
            return Conflict(new { error = "An admin password is already set." });

        var hash = _hasher.Hash(req.Password);
        await _settings.SetAsync(SettingKeys.AdminPasswordHash, hash, actor: "system", ct: ct);
        _db.AuditLogs.Add(new AuditLog
        {
            Timestamp = DateTime.UtcNow,
            Actor = "system",
            Action = "admin.password_set",
            Details = "{\"event\":\"first-run setup\"}"
        });
        await _db.SaveChangesAsync(ct);

        return Ok();
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req, CancellationToken ct)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";

        if (_attempts.IsLockedOut(ip))
            return StatusCode(StatusCodes.Status429TooManyRequests,
                new { error = "Too many failed attempts. Try again later." });

        var hash = await _settings.GetAsync(SettingKeys.AdminPasswordHash, ct);
        if (string.IsNullOrWhiteSpace(hash))
            return StatusCode(StatusCodes.Status403Forbidden,
                new { error = "Admin password has not been set." });

        if (string.IsNullOrEmpty(req.Password) || !_hasher.Verify(req.Password, hash))
        {
            var nowLockedOut = _attempts.RecordFailure(ip);
            if (nowLockedOut)
            {
                _db.AuditLogs.Add(new AuditLog
                {
                    Timestamp = DateTime.UtcNow,
                    Actor = "system",
                    Action = "auth.lockout",
                    Details = $"{{\"ip\":\"{ip}\",\"window_minutes\":15}}"
                });
                await _db.SaveChangesAsync(ct);
                _log.LogWarning("Login lockout triggered for IP {Ip}", ip);
            }
            return Unauthorized(new { error = "Invalid password." });
        }

        // Success — clear failure counter and sign in.
        _attempts.Reset(ip);

        var claims = new[]
        {
            new Claim(ClaimTypes.Name, AuthClaims.AdminRole),
            new Claim(ClaimTypes.Role, AuthClaims.AdminRole),
        };
        var identity = new ClaimsIdentity(claims, AuthSchemes.Cookie);
        var principal = new ClaimsPrincipal(identity);

        var props = new AuthenticationProperties
        {
            IsPersistent = req.RememberDevice,
            ExpiresUtc = req.RememberDevice ? DateTimeOffset.UtcNow.AddDays(RememberMeDays) : null
        };

        await HttpContext.SignInAsync(AuthSchemes.Cookie, principal, props);

        _db.AuditLogs.Add(new AuditLog
        {
            Timestamp = DateTime.UtcNow,
            Actor = "admin",
            Action = "auth.login",
            Details = $"{{\"ip\":\"{ip}\",\"remember\":{(req.RememberDevice ? "true" : "false")}}}"
        });
        await _db.SaveChangesAsync(ct);

        return Ok(new { authed = true });
    }

    [Authorize(Policy = AuthPolicies.AdminOnly)]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(AuthSchemes.Cookie);
        _db.AuditLogs.Add(new AuditLog
        {
            Timestamp = DateTime.UtcNow,
            Actor = "admin",
            Action = "auth.logout",
            Details = "{}"
        });
        await _db.SaveChangesAsync();
        return Ok();
    }
}
