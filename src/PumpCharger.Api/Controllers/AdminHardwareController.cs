using System.Diagnostics;
using System.Net.Sockets;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using PumpCharger.Api.Auth;
using PumpCharger.Api.Config;
using PumpCharger.Api.Data;
using PumpCharger.Api.Models.Admin;
using PumpCharger.Core.Entities;

namespace PumpCharger.Api.Controllers;

[ApiController]
[Route("api/admin/hardware")]
[Authorize(Policy = AuthPolicies.AdminOnly)]
public class AdminHardwareController : ControllerBase
{
    private const int Port = 80;
    private static readonly TimeSpan TestTimeout = TimeSpan.FromSeconds(5);

    private readonly AppDbContext _db;
    private readonly Func<DateTime> _clock;

    public AdminHardwareController(AppDbContext db, Func<DateTime> clock)
    {
        _db = db;
        _clock = clock;
    }

    /// <summary>
    /// Return the configured Mode (Fake/Real) per client and Shelly's
    /// enabled flag. These values come from appsettings.json bindings and
    /// require a backend restart to change — the Hardware tab surfaces them
    /// read-only with a tooltip explaining how.
    /// </summary>
    [HttpGet]
    public ActionResult<HardwareInfoResponse> GetInfo(
        [FromServices] IOptions<HpwcOptions> hpwcOpts,
        [FromServices] IOptions<ShellyOptions> shellyOpts)
    {
        return Ok(new HardwareInfoResponse(
            Hpwc: new ClientInfo(hpwcOpts.Value.Mode.ToString(), null),
            Shelly: new ClientInfo(shellyOpts.Value.Mode.ToString(), shellyOpts.Value.Enabled)));
    }

    /// <summary>
    /// TCP reachability probe to the supplied host on port 80. Returns
    /// success + latency when the device accepts a TCP connection, or a
    /// specific error message when it doesn't. Does not validate protocol —
    /// the upgrade to protocol-aware testing lands alongside the real HPWC
    /// HTTP client in Phase 8.
    /// </summary>
    [HttpPost("test-hpwc")]
    public async Task<ActionResult<HardwareTestResponse>> TestHpwc(
        [FromBody] TestHardwareRequest req, CancellationToken ct)
    {
        var result = await ProbeReachabilityAsync(req, ct);
        await WriteAuditAsync("admin.hardware.test_hpwc", req.Host, result, ct);
        return Ok(result);
    }

    /// <summary>
    /// TCP reachability probe to the supplied Shelly host on port 80. Same
    /// scope as test-hpwc; protocol-aware upgrade lands in Phase 9.
    /// </summary>
    [HttpPost("test-shelly")]
    public async Task<ActionResult<HardwareTestResponse>> TestShelly(
        [FromBody] TestHardwareRequest req, CancellationToken ct)
    {
        var result = await ProbeReachabilityAsync(req, ct);
        await WriteAuditAsync("admin.hardware.test_shelly", req.Host, result, ct);
        return Ok(result);
    }

    private static async Task<HardwareTestResponse> ProbeReachabilityAsync(
        TestHardwareRequest req, CancellationToken outerCt)
    {
        if (string.IsNullOrWhiteSpace(req.Host))
            return new HardwareTestResponse(false, 0, "Host is required.", null);

        var sw = Stopwatch.StartNew();
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(outerCt);
            cts.CancelAfter(TestTimeout);
            using var tcp = new TcpClient();
            await tcp.ConnectAsync(req.Host, Port, cts.Token);
            sw.Stop();
            return new HardwareTestResponse(
                Success: true,
                LatencyMs: sw.ElapsedMilliseconds,
                Error: null,
                Details: new Dictionary<string, string>
                {
                    ["host"] = req.Host,
                    ["port"] = Port.ToString(),
                });
        }
        catch (OperationCanceledException) when (!outerCt.IsCancellationRequested)
        {
            sw.Stop();
            return new HardwareTestResponse(
                Success: false,
                LatencyMs: sw.ElapsedMilliseconds,
                Error: $"No response from {req.Host} within {TestTimeout.TotalSeconds:F0}s — check the IP address and network connectivity.",
                Details: null);
        }
        catch (SocketException ex)
        {
            sw.Stop();
            return new HardwareTestResponse(
                Success: false,
                LatencyMs: sw.ElapsedMilliseconds,
                Error: MapSocketError(req.Host, Port, ex),
                Details: null);
        }
    }

    private static string MapSocketError(string host, int port, SocketException ex) => ex.SocketErrorCode switch
    {
        SocketError.ConnectionRefused =>
            $"Connection refused at {host}:{port} — is the device powered on and on the network?",
        SocketError.HostNotFound =>
            $"Cannot resolve hostname '{host}' — check the IP address or hostname.",
        SocketError.HostUnreachable or SocketError.NetworkUnreachable =>
            $"Cannot route to {host} — is the IP correct for your network?",
        SocketError.TimedOut =>
            $"No response from {host}:{port} within the OS connect timeout — check connectivity.",
        _ => $"Connection failed ({ex.SocketErrorCode}): {ex.Message}",
    };

    private async Task WriteAuditAsync(
        string action, string host, HardwareTestResponse result, CancellationToken ct)
    {
        // Audit log entry per test call so future debugging has a record of
        // when an admin last confirmed reachability to a particular host.
        var details = result.Success
            ? $"{{\"host\":\"{Escape(host)}\",\"success\":true,\"latencyMs\":{result.LatencyMs}}}"
            : $"{{\"host\":\"{Escape(host)}\",\"success\":false,\"latencyMs\":{result.LatencyMs},\"error\":\"{Escape(result.Error ?? "")}\"}}";

        _db.AuditLogs.Add(new AuditLog
        {
            Timestamp = _clock(),
            Actor = "admin",
            Action = action,
            Details = details,
        });
        await _db.SaveChangesAsync(ct);
    }

    private static string Escape(string s) => s.Replace("\\", "\\\\").Replace("\"", "\\\"");
}
