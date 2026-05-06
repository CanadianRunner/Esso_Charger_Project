using Microsoft.AspNetCore.Mvc;
using PumpCharger.Api.Services.External.Fake;

namespace PumpCharger.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DemoController : ControllerBase
{
    private readonly FakeHpwcSimulator? _simulator;

    public DemoController(IServiceProvider services)
    {
        _simulator = services.GetService<FakeHpwcSimulator>();
    }

    [HttpPost("plug-in")]
    public IActionResult PlugIn() => RunOrNotFound(s => s.PlugIn());

    [HttpPost("unplug")]
    public IActionResult Unplug() => RunOrNotFound(s => s.Unplug());

    [HttpPost("start-charging")]
    public IActionResult StartCharging() => RunOrNotFound(s => s.StartCharging());

    [HttpPost("stop-charging")]
    public IActionResult StopCharging() => RunOrNotFound(s => s.StopCharging());

    [HttpPost("trigger-cycling")]
    public IActionResult TriggerCycling() => RunOrNotFound(s => s.TriggerCyclingPause());

    [HttpPost("simulate-network-failure")]
    public IActionResult SimulateNetworkFailure([FromQuery] int seconds = 60)
    {
        if (_simulator is null) return NotConfigured();
        _simulator.SimulateNetworkFailure(TimeSpan.FromSeconds(seconds));
        return Ok(new { failingForSeconds = seconds });
    }

    [HttpPost("clear-network-failure")]
    public IActionResult ClearNetworkFailure()
    {
        if (_simulator is null) return NotConfigured();
        _simulator.ClearNetworkFailure();
        return Ok();
    }

    private IActionResult RunOrNotFound(Func<FakeHpwcSimulator, SimSnapshot> action)
    {
        if (_simulator is null) return NotConfigured();
        var snapshot = action(_simulator);
        return Ok(snapshot);
    }

    private IActionResult NotConfigured() =>
        NotFound(new { error = "Demo endpoints require Hpwc.Mode=Fake." });
}
