using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PumpCharger.Api.Data;

namespace PumpCharger.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    private readonly AppDbContext _db;

    public HealthController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var dbReachable = await _db.Database.CanConnectAsync(cancellationToken);
        var status = dbReachable ? "ok" : "degraded";

        return Ok(new
        {
            status,
            time = DateTime.UtcNow,
            version = typeof(HealthController).Assembly.GetName().Version?.ToString() ?? "0.0.0",
            database = new { reachable = dbReachable }
        });
    }
}
