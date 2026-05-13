using Microsoft.AspNetCore.Mvc;
using PumpCharger.Api.Services.External.Fake;
using PumpCharger.Core.External;

namespace PumpCharger.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DevController : ControllerBase
{
    private readonly IHpwcClient _hpwc;
    private readonly IShellyClient _shelly;
    private readonly IOpenEiClient _openEi;
    private readonly IHostEnvironment _env;
    private readonly IServiceProvider _services;

    public DevController(
        IHpwcClient hpwc,
        IShellyClient shelly,
        IOpenEiClient openEi,
        IHostEnvironment env,
        IServiceProvider services)
    {
        _hpwc = hpwc;
        _shelly = shelly;
        _openEi = openEi;
        _env = env;
        _services = services;
    }

    /// <summary>
    /// Trigger a fresh simulated charging session. Gated to Development +
    /// fake-mode only; returns 404 otherwise. The simulator otherwise stays in
    /// Idle until explicitly plugged in.
    /// </summary>
    [HttpPost("sim/plug-in")]
    public IActionResult PlugInSimulator([FromQuery] int? durationSeconds)
    {
        if (!_env.IsDevelopment()) return NotFound();
        var sim = _services.GetService<FakeHpwcSimulator>();
        if (sim is null) return NotFound(new { error = "Simulator not registered (Mode=Real)." });
        var snap = sim.PlugIn(durationSeconds);
        return Ok(new { state = snap.State.ToString(), chargingDurationSeconds = durationSeconds });
    }

    [HttpGet("hpwc/vitals")]
    public async Task<IActionResult> Vitals(CancellationToken ct) => Ok(await _hpwc.GetVitalsAsync(ct));

    [HttpGet("hpwc/lifetime")]
    public async Task<IActionResult> Lifetime(CancellationToken ct) => Ok(await _hpwc.GetLifetimeAsync(ct));

    [HttpGet("hpwc/version")]
    public async Task<IActionResult> Version(CancellationToken ct) => Ok(await _hpwc.GetVersionAsync(ct));

    [HttpGet("shelly/status")]
    public async Task<IActionResult> ShellyStatus(CancellationToken ct)
    {
        if (!_shelly.IsConfigured) return NotFound(new { error = "Shelly not configured." });
        return Ok(await _shelly.GetEmStatusAsync(ct));
    }

    [HttpGet("shelly/data")]
    public async Task<IActionResult> ShellyData(CancellationToken ct)
    {
        if (!_shelly.IsConfigured) return NotFound(new { error = "Shelly not configured." });
        return Ok(await _shelly.GetEmDataStatusAsync(ct));
    }

    [HttpGet("openei/schedules")]
    public async Task<IActionResult> Schedules([FromQuery] string utility = "Portland General Electric", CancellationToken ct = default)
    {
        if (!_openEi.IsConfigured) return NotFound(new { error = "OpenEI not configured." });
        return Ok(await _openEi.SearchSchedulesAsync(utility, ct));
    }

    [HttpGet("openei/rate")]
    public async Task<IActionResult> Rate([FromQuery] string scheduleId, CancellationToken ct = default)
    {
        if (!_openEi.IsConfigured) return NotFound(new { error = "OpenEI not configured." });
        var rate = await _openEi.PullRateAsync(scheduleId, ct);
        if (rate is null) return NotFound(new { error = $"Schedule {scheduleId} not found." });
        return Ok(rate);
    }
}
