using PumpCharger.Core.External.Models;

namespace PumpCharger.Api.Services.Sessions;

/// <summary>
/// Pure state machine that translates a stream of HPWC vitals into Open/Close events.
/// A session is a continuous window of vehicle_connected=true. Contactor cycling
/// (cycling-charge for battery thermal) is ignored because vehicle_connected stays true.
/// </summary>
public class SessionDetector
{
    private bool _inSession;
    private decimal _peakKw;
    private long _lastSessionWh;

    public bool InSession => _inSession;
    public decimal CurrentPeakKw => _peakKw;
    public long CurrentSessionWh => _lastSessionWh;

    public void AdoptActiveSession(decimal initialPeakKw = 0, long initialSessionWh = 0)
    {
        _inSession = true;
        _peakKw = initialPeakKw;
        _lastSessionWh = initialSessionWh;
    }

    public SessionEvent Process(HpwcVitals vitals, DateTime nowUtc)
    {
        if (!_inSession)
        {
            if (vitals.VehicleConnected)
            {
                _inSession = true;
                _peakKw = (decimal)vitals.LiveKw;
                _lastSessionWh = (long)vitals.SessionEnergyWh;
                return new SessionEvent(SessionAction.Open, nowUtc);
            }
            return new SessionEvent(SessionAction.None, nowUtc);
        }

        // We're in a session. Vehicle disconnection closes immediately —
        // close-time vitals carry no useful per-session reading, so use the latest
        // in-session value we already captured.
        if (!vitals.VehicleConnected)
        {
            var ev = new SessionEvent(SessionAction.Close, nowUtc, _lastSessionWh, _peakKw);
            _inSession = false;
            _peakKw = 0;
            _lastSessionWh = 0;
            return ev;
        }

        // Still connected. Track peak and latest energy across cycling pauses —
        // contactor toggling alone does not split the session.
        var liveKw = (decimal)vitals.LiveKw;
        if (liveKw > _peakKw) _peakKw = liveKw;
        _lastSessionWh = (long)vitals.SessionEnergyWh;

        return new SessionEvent(SessionAction.None, nowUtc);
    }
}
