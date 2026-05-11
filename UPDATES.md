# _Esso Pump EV Charger Conversion -- Update Archive_

Past development updates for the Esso Pump → EV Charger project.  The most recent update lives on the main [README](README.md); everything older lives here, reverse-chronological.

## Update #5 (05/09/2026)

_Phase 4 is complete -- live data flowing end-to-end:_  the backend now publishes a `pumpState` payload over a SignalR WebSocket hub at `/hubs/pump`, and the frontend kiosk view at `/pump` subscribes to it and renders the live state in a 768x1024 portrait layout that matches the eventual faceplate cutouts.  The visuals are intentionally placeholder for now -- chunky monospace digits, no animation -- because Phase 5 is where the actual mechanical-odometer dials get built.  The point of this phase was to prove the wiring, not to polish the look.

A few architectural pieces had to land for this to work:

* **Multi-subscriber `VitalsBus`**.  The session manager and the new display broadcaster both need the same vitals stream, so the single-channel pattern from Phase 3 got replaced with a tiny fanout bus that hands each subscriber its own bounded channel.
* **`PumpStateBuilder`** turns the latest vitals plus the database state into the wire-shape the frontend expects -- display state derived from the four-state rule in the spec, active session payload combining the persisted prior segments with the live in-flight energy, year-to-date kWh, all-time session count, lifetime kWh including the configurable offset.
* **`DisplayBroadcastService`** subscribes to the vitals bus and pushes a fresh payload on every tick (which is naturally 1 second when active and 5 seconds when idle, matching the spec's cadence requirement).  It caches the slow-moving HPWC lifetime call to refresh every 30 seconds rather than once per push.
* **Frontend store** is a small Zustand singleton plus a hook that flips the in-page `⚠ reconnecting` badge if no SignalR message arrives for 15 seconds.

End-to-end I confirmed the pipeline by writing a tiny Node SignalR probe that connected to the hub, received five live `pumpState` messages while the simulator was charging, and watched session energy tick from 0.083 -> 0.097 -> 0.111 -> 0.125 kWh in real time.  Test count is up to 63 (59 backend + 4 frontend) and CI now also runs the frontend tests.

## Update #4 (05/09/2026)

_Phase 3 is complete -- session detection:_  the app now turns the live HPWC vitals stream into proper Session rows in the database.  A session is defined as a continuous window where the vehicle is connected -- contactor cycling during charging (the car waking up to top up its battery thermal management) does not split the session, which matches how a real EV charging session actually behaves.

I split the work into three layers so each piece could be tested on its own.  A pure `SessionDetector` class watches the vitals stream and emits Open / Close / None events with no database knowledge at all.  A `SessionStore` handles the database side -- creating the row on Open with the current rate snapshotted in, finalizing energy and cost on Close, and merging an unplug-then-replug back into the prior session if it happened inside the configurable grace window (default 60 seconds).  A `SessionManagerService` background service glues the two together off a `Channel<T>` published by a new `HpwcPollerService` that polls adaptively -- 1 second when a session is active, 5 seconds when idle, and backs off to 30 seconds after three consecutive failures.

A few things worth calling out:

* **Rate is snapshotted at session start**, so editing the rate mid-session doesn't retroactively change historical cost calculations.
* **Reboot recovery** -- if the Pi loses power mid-charge, on next startup the manager scans the database for any session left with a null `EndedAt`, adopts it, and continues tracking from where it left off.
* I noticed the spec had a typo on the cost formula (`/100000` instead of `/1000`), so I corrected it -- a 2.238 kWh session at 13¢/kWh now lands at the correct 29¢ instead of evaluating to a single cent.
* I also added a `SettingsService` with default seeding for the rate, merge grace window, idle threshold, lifetime offset, and display rotation interval.  Every setting change writes a row to the audit log.

End-to-end I drove a full charging cycle through the demo controls and watched the session row open, fill in, close, then merge with a follow-up replug -- exactly as designed.  Test count is up to 49 and CI is green.

## Update #3 (05/05/2026)

_Phase 2 is complete -- fake-first external clients:_  every external integration (HPWC, Shelly, OpenEI) now sits behind an interface in `PumpCharger.Core` with both a real-stub and a fake implementation chosen at startup by a config flag.  In dev mode the app boots into Fake mode automatically and runs entirely on simulated data, so I can build and demo the whole pump display before any hardware is installed.

The HPWC fake is a proper state-machine simulator -- it walks Idle → Plugged → Charging → CyclingPause → ChargingResumed → SessionComplete on its own, accumulating session and lifetime energy at a configurable kW rate, and a `TimeAcceleration` knob (default 5x in dev) compresses the full cycle to about 88 real seconds.  The Shelly fake mirrors the same circuit so its readings are consistent with the HPWC, and the OpenEI fake serves canned schedules so the rate-pull logic can be exercised without a real API key.

I also added two controllers for driving and observing the simulator while developing:

* `POST /api/demo/plug-in`, `/unplug`, `/start-charging`, `/stop-charging`, `/trigger-cycling`, `/simulate-network-failure` -- jump the simulator straight to a state without waiting on the natural cycle.
* `GET /api/dev/hpwc/vitals`, `/lifetime`, `/version` and the matching Shelly + OpenEI read-back endpoints -- whatever the rest of the app sees, you can see too.

The simulator has full xUnit coverage including auto-transitions, energy accumulation across both charge windows, contactor and connector cycle counters, the network-failure window, and every manual demo control.  Test count is up to 19 and CI is green.

## Update #2 (05/05/2026)

After a first pass on the `v1` branch, I rebooted the application on a new stack: .NET 8 + ASP.NET Core for the backend with EF Core + SQLite, and React 18 + TypeScript + Vite + Tailwind for the frontend.  Real-time data will flow over SignalR.  The Shelly Pro EM-50 (with CT clamps) replaces OpenEVSE for energy metering, and the Tesla HPWC's local HTTP API is now the primary data source for both session detection and lifetime kWh.

The architecture is "local-dev-first" -- fake HPWC and Shelly clients let me build, run, and demo the entire pump display on a laptop with no hardware connected.

_Phase 1 is complete -- foundation:_  solution scaffold, the five domain entities (Session, LifetimeSnapshot, Setting, RateHistory, AuditLog), an initial EF migration, Serilog wiring, a `/api/health` endpoint, the Vite + Tailwind frontend skeleton, xUnit smoke tests, and a GitHub Actions CI pipeline.

To run locally:

```bash
# Backend (terminal 1)
cd src/PumpCharger.Api
dotnet run

# Frontend (terminal 2)
cd web
npm install
npm run dev
```

Then open http://localhost:5173.  The dev API listens on 5050 instead of 5000 because macOS AirPlay Receiver squats on port 5000; production on the Pi will use 5000.

## Update #1 (01/22/2025)

I've acquired my gas pump and started the project's hardware and software planning phase! 

_My hardware decisions thus far:_

I plan to use Tesla's HPWC to juice up my vehicles physically.  I will use OpenEVSE's Wi-Fi kit and C-clamp adapters to measure and report the kWh delivered each session.  I will use a Raspberry Pi 5 to run my application and consume/output data.  I will use two small outdoor-rated displays in place of the physical rotary dials.  I will have to run 240-v power to the charger, 120v to the supporting infrastructure, and ethernet to the Raspberry Pi (I imagine Wi-Fi will be spotty in my new Esso branded Faraday box).  To protect this project, I will need to make additional improvements to the waterproofing, airflow, and humidity control.

_On the software front:_

I have scaffolded a rough starting point for the application, with the frontend (React) and backend (Python) contained in the same directory.  I want to consume an API that pulls my power company price per/kWh to prevent the need for manual updates over the years.  I would like to display the lifetime kWh delivered so I can take preventative measures in case of unit failure, power outages, etc.  I will send saved metrics to my remote server as a failover, as I'd like to utilize this system for years to come.
