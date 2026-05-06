# _Esso Pump EV Charger Conversion_

#### By _**Sean Keane**_

#### Application for pump displays -- 01/22/2025

## Technologies Used

* .NET 8 / ASP.NET Core
* Entity Framework Core
* SQLite (Litestream replication)
* SignalR
* React 18
* TypeScript
* Vite
* Tailwind CSS

## Description

This is a personal project I've undertaken that combines my love for software and hardware.  I am converting a restored 1950s gas pump into an electric vehicle charger.  This project goes beyond charging infrastructure; I plan on replacing the rotary dials with cleverly disguised displays that will output the number of kWh delivered, charge cost (based on my home rates), and other relevant metrics.

I plan to update this README with images and my progress as I tackle the unforeseen challenges of bringing this project to life.

## Restored Pump:

![RestoredPump](images/starter_pump.png)

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


## Known Bugs

* No known bugs


## License

If you have any questions or concerns feel free to contact me at code@sean-keane.com

*This is licensed under the MIT license*

Copyright (c) 01-22-2025 **_Sean Keane_**
