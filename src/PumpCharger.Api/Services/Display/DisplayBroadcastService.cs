using Microsoft.AspNetCore.SignalR;
using PumpCharger.Api.Hubs;
using PumpCharger.Api.Services.Polling;
using PumpCharger.Core.External;
using PumpCharger.Core.External.Models;

namespace PumpCharger.Api.Services.Display;

public class DisplayBroadcastService : BackgroundService
{
    private static readonly TimeSpan LifetimeRefreshInterval = TimeSpan.FromSeconds(30);

    private readonly VitalsBus _bus;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHubContext<PumpHub> _hub;
    private readonly IHpwcClient _hpwc;
    private readonly IShellyClient _shelly;
    private readonly ILogger<DisplayBroadcastService> _log;

    private HpwcLifetime? _cachedLifetime;
    private DateTime _cachedLifetimeAtUtc = DateTime.MinValue;
    private DateTime _shellyPingedAtUtc = DateTime.MinValue;
    private bool _hpwcConnected = true;
    private bool _shellyConnected;

    public DisplayBroadcastService(
        VitalsBus bus,
        IServiceScopeFactory scopeFactory,
        IHubContext<PumpHub> hub,
        IHpwcClient hpwc,
        IShellyClient shelly,
        ILogger<DisplayBroadcastService> log)
    {
        _bus = bus;
        _scopeFactory = scopeFactory;
        _hub = hub;
        _hpwc = hpwc;
        _shelly = shelly;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("DisplayBroadcastService starting.");
        var reader = _bus.Subscribe();

        try
        {
            await foreach (var timed in reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    await EnsureLifetimeFreshAsync(timed.AtUtc, stoppingToken);
                    await PingShellyAsync(timed.AtUtc, stoppingToken);

                    using var scope = _scopeFactory.CreateScope();
                    var builder = scope.ServiceProvider.GetRequiredService<PumpStateBuilder>();

                    var state = await builder.BuildAsync(
                        timed.Vitals,
                        _cachedLifetime ?? new HpwcLifetime(),
                        timed.AtUtc,
                        _hpwcConnected,
                        _shellyConnected,
                        stoppingToken);

                    await _hub.Clients.All.SendAsync(PumpHub.PumpStateEvent, state, stoppingToken);
                }
                catch (Exception ex)
                {
                    _log.LogError(ex, "DisplayBroadcastService failed to broadcast pump state.");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }

        _log.LogInformation("DisplayBroadcastService stopping.");
    }

    private async Task EnsureLifetimeFreshAsync(DateTime nowUtc, CancellationToken ct)
    {
        if (_cachedLifetime is not null && (nowUtc - _cachedLifetimeAtUtc) < LifetimeRefreshInterval)
            return;

        try
        {
            _cachedLifetime = await _hpwc.GetLifetimeAsync(ct);
            _cachedLifetimeAtUtc = nowUtc;
            _hpwcConnected = true;
        }
        catch (Exception ex)
        {
            _hpwcConnected = false;
            _log.LogDebug(ex, "Lifetime refresh failed; reusing cached value.");
        }
    }

    private async Task PingShellyAsync(DateTime nowUtc, CancellationToken ct)
    {
        if (!_shelly.IsConfigured)
        {
            _shellyConnected = false;
            return;
        }
        if ((nowUtc - _shellyPingedAtUtc) < LifetimeRefreshInterval) return;

        try
        {
            await _shelly.GetEmStatusAsync(ct);
            _shellyConnected = true;
        }
        catch
        {
            _shellyConnected = false;
        }
        _shellyPingedAtUtc = nowUtc;
    }
}
