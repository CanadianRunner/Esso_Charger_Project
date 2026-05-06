# Vintage Gas Pump → EV Charger Conversion: Build Spec

## Mission

Build a full-stack application that turns a restored 1950s Esso gas pump into a Tesla EV charger station with mechanical-odometer-style digital dials. The pump houses a Tesla High Power Wall Connector (HPWC) that handles actual charging; the software's job is to display real-time charging data through original-style dial cutouts in the pump face, persist usage history, and provide a web UI for management. The aesthetic goal is "vintage gas pump" — period-correct visual style for the dials, modern accuracy and connectivity under the hood.

This is a personal/hobby project running on a single Raspberry Pi 5 mounted inside the pump. It is not multi-tenant, not cloud-hosted, and does not need to scale beyond one pump.

## Repository state — do this FIRST

The repo currently has a `main` branch with a previous attempt and a `v1` branch where that attempt is stashed for reference. Before writing any code:

1. Verify you're on `main`. If not, check it out.
2. Confirm `v1` branch exists and contains the previous code (don't touch it — it's reference material the user may want to consult).
3. **Wipe `main` clean.** Remove all files except `.git/`, `.gitignore` (preserve or recreate), `README.md` (recreate), and `LICENSE` if present. This is a from-scratch rebuild.
4. Make an initial commit on `main` with a clean slate before starting the build.

Do not delete or modify the `v1` branch under any circumstances.

## Local development is first-class — hardware is plug-in-later

**The user does not have all the hardware yet** (the Shelly was just ordered, the HPWC will be installed by an electrician later, the Pi 5 isn't yet running the production OS). The app must be fully buildable, runnable, and demoable on a developer laptop (macOS or Linux) **with no real hardware connected**.

This is not a "dev mode" hack. This is a first-class capability. The architecture must support both modes equally:

1. **Development mode** (the default for `dotnet run`):
   - HPWC client points to a built-in **fake HPWC server** that simulates realistic data: idle states, charging sessions, lifetime accumulation, cycling charge events, network failures.
   - Shelly client similarly uses a fake.
   - OpenEI uses a captured response fixture so rate logic can be exercised without an API key.
   - SignalR pushes data to the React app exactly as it would in production.
   - The pump display works in a desktop browser at the correct 768×1024 portrait dimensions (open it at `http://localhost:5000/pump`).
   - Admin UI works at `http://localhost:5000/admin`.

2. **Production mode**: same code, configuration values point at real device IPs/hostnames.

### Implementation approach

- All external integrations go through interfaces: `IHpwcClient`, `IShellyClient`, `IOpenEiClient`.
- Two implementations of each: `HpwcHttpClient` (real) and `FakeHpwcClient` (simulated).
- Choose between them based on `appsettings.Development.json` vs `appsettings.Production.json`, OR by config flag `Hpwc:Mode = "Real" | "Fake"`. Default in dev: Fake. Default in prod: Real.
- The fake clients should be sophisticated, not stubs. They simulate:
  - **Idle state** (vehicle disconnected) for ~30 seconds, then a vehicle "plugs in"
  - **5 minutes of charging** at a realistic rate (~10 kW), accumulating session_energy_wh
  - **A pause** simulating cycling charge (contactor opens, then re-closes after 30s)
  - **Disconnect**, session ends, lifetime energy increments
  - Cycle repeats so you can demo all states without waiting hours
  - Configurable speed: `Hpwc:Fake:TimeAcceleration = 1.0` (real-time) or `10.0` (10x faster for demos)

- **A demo-control panel** in the admin UI when running in fake mode: buttons to "plug in vehicle", "unplug vehicle", "start charging", "stop charging", "trigger cycling event", "simulate network failure for 60s". This makes it trivial to demo the full state machine without waiting for the simulator to cycle.

### Configuration placeholders

In `appsettings.json`:

```json
{
  "Hpwc": {
    "Mode": "Real",
    "Host": "REPLACE_WITH_HPWC_IP_OR_HOSTNAME",
    "PollIntervalActiveMs": 1000,
    "PollIntervalIdleMs": 5000,
    "TimeoutMs": 3000
  },
  "Shelly": {
    "Mode": "Real",
    "Enabled": true,
    "Host": "REPLACE_WITH_SHELLY_IP_OR_HOSTNAME",
    "PollIntervalMs": 5000
  },
  "OpenEI": {
    "Mode": "Real",
    "ApiKey": "REPLACE_WITH_OPENEI_API_KEY"
  }
}
```

In `appsettings.Development.json` (committed to repo, used for `dotnet run`):

```json
{
  "Hpwc": {
    "Mode": "Fake",
    "Fake": {
      "TimeAcceleration": 5.0,
      "InitialLifetimeWh": 1234500
    }
  },
  "Shelly": {
    "Mode": "Fake"
  },
  "OpenEI": {
    "Mode": "Fake"
  }
}
```

The user fills in the placeholder IPs/key when they're ready to point at real hardware. The README must clearly document this transition.

### Acceptance criterion for "local dev works"

After `git clone`, `cd src/PumpCharger.Api && dotnet ef database update && dotnet run` (one terminal) and `cd web && npm install && npm run dev` (another terminal), opening `http://localhost:5173/pump` in a Chrome window resized to 768×1024 portrait shows the full pump display rendering through a complete simulated charging session within ~2 minutes (with `TimeAcceleration: 5.0`). No real hardware required, no manual data entry required, no errors in console.

## Hardware context (the code must match this reality)

- **Compute**: Raspberry Pi 5, 8GB RAM, running Raspberry Pi OS (Debian Bookworm, 64-bit). Boot from SSD via USB if possible for reliability.
- **EV Charger**: Tesla High Power Wall Connector (HPWC) Gen 3, WiFi-enabled, mounted inside the pump. The HPWC handles all actual charging — the app is monitor-only. The HPWC has an undocumented but stable local HTTP API (read-only) that exposes charging data.
- **Energy meter (secondary/redundant)**: Shelly Pro EM-50 with 2x 50A CT clamps, mounted on DIN rail inside the pump, monitoring the L1/L2 conductors feeding the HPWC. Local HTTP RPC API. *Note: the meter is optional — the HPWC API is the primary data source. The Shelly is a sanity-check / redundancy layer only.*
- **Displays**: 2x GreenTouch 10.4" 1024x768 IP65 outdoor monitors, one per side of the pump, both mirrored (showing identical content). Connected to Pi 5's two micro-HDMI outputs. **Mounted in portrait orientation** (rotated 90°), so effective resolution is **768 wide × 1024 tall** per side.
- **Network**: Pi connects to home WiFi. HPWC and Shelly are on the same LAN with static reservations (the user will configure these in the router and supply the IPs/hostnames via app settings).
- **Install location**: Outdoors. The app does not need to know about the install location for logic reasons, but the code should not assume always-on internet (handle network outages gracefully, queue OpenEI rate updates).

## Tech stack — non-negotiable

- **Backend**: .NET 8 LTS, ASP.NET Core, C#
- **Real-time push**: SignalR (over WebSockets)
- **ORM**: Entity Framework Core
- **Database**: SQLite (single file at `/var/lib/pumpcharger/pumpcharger.db`)
- **DB replication**: Litestream (configurable backup destination — local path, NAS, S3)
- **Frontend**: React 18+, TypeScript, Vite as the build tool
- **Frontend styling**: Tailwind CSS
- **Frontend state**: React hooks + a small Zustand store for global state (no Redux)
- **HTTP client (frontend)**: native `fetch` + a thin wrapper. Don't pull in axios.
- **HTTP client (backend)**: `HttpClient` via `IHttpClientFactory` with named clients per external service.
- **Auth**: ASP.NET Core cookie-based auth, single admin password, BCrypt-hashed and stored in DB. Cookie set to 30 days when "Remember this device" is checked, otherwise session-lifetime.
- **Logging**: Serilog, writing to console + rolling file at `/var/log/pumpcharger/`
- **Process management**: systemd unit, auto-restart on failure
- **Browser kiosk**: Chromium in `--kiosk` mode, full-screen, on Wayland or X11 (whichever the Pi 5 image defaults to in current Bookworm — verify before committing to one)

The backend serves the React app's static build files from a single Kestrel process. **Do not** run a separate Node server in production. In development, Vite's dev server proxies API calls to the backend.

## Repository structure

```
/
├── README.md
├── .gitignore
├── docker-compose.yml          (for local dev only — Mosquitto MQTT broker for testing)
├── deploy/
│   ├── pumpcharger.service     (systemd unit)
│   ├── kiosk-launch.sh         (chromium kiosk launcher)
│   ├── display-setup.sh        (xrandr/wlr-randr for portrait + mirror)
│   ├── litestream.yml          (replication config)
│   └── install.sh              (one-shot installer for the Pi)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── HARDWARE.md
│   ├── DEPLOYMENT.md
│   └── API.md
├── src/
│   ├── PumpCharger.Api/        (ASP.NET Core project)
│   │   ├── Program.cs
│   │   ├── Controllers/
│   │   ├── Hubs/               (SignalR hubs)
│   │   ├── Services/           (HpwcPoller, ShellyPoller, RatePuller, SessionManager)
│   │   ├── Data/               (DbContext, Entities, Migrations)
│   │   ├── Auth/
│   │   ├── Config/
│   │   └── appsettings.json
│   ├── PumpCharger.Core/       (domain models, business logic — no infra deps)
│   └── PumpCharger.Tests/      (xUnit unit + integration tests)
├── web/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes/
│       │   ├── PumpDisplay.tsx     (the kiosk view at /pump)
│       │   └── admin/              (the admin UI at /admin/*)
│       ├── components/
│       │   ├── dials/              (OdometerDial, MiniReadout, etc.)
│       │   ├── admin/
│       │   └── shared/
│       ├── hooks/
│       ├── stores/
│       └── lib/
└── .github/
    └── workflows/
        └── ci.yml              (build + test on push)
```

## Data model (Entity Framework entities)

Define these as POCOs in `PumpCharger.Core/Entities` and configure via `IEntityTypeConfiguration<T>` in `PumpCharger.Api/Data/Configurations`.

### Session
- `Id` (Guid, PK)
- `StartedAt` (DateTime UTC)
- `EndedAt` (DateTime UTC, nullable while in progress)
- `EnergyWh` (long — store in watt-hours, not kWh, to avoid float drift)
- `RateAtStartCentsPerKwh` (int — snapshot of the rate at session start, in cents)
- `CostCents` (long — computed at session end)
- `PeakKw` (decimal, 2dp)
- `DurationSeconds` (long)
- `IsMerged` (bool — true if this session was merged from a previous one within the grace window)
- `Notes` (string, nullable — for manual annotations from admin UI)

### LifetimeSnapshot
- `Id` (long, PK, auto-increment)
- `RecordedAt` (DateTime UTC)
- `HpwcLifetimeWh` (long — what the HPWC reported at this moment)
- `ComputedLifetimeWh` (long — SUM of all session energy + offset)
- `DriftWh` (long — computed delta, for sanity-check alerting)

Recorded once per hour and on every session end.

### Setting
- `Key` (string, PK — e.g., "rate.flat_cents_per_kwh", "hpwc.host", "shelly.host", "session.merge_grace_seconds", "admin.password_hash")
- `Value` (string)
- `UpdatedAt` (DateTime UTC)

### RateHistory
- `Id` (long, PK, auto-increment)
- `EffectiveFrom` (DateTime UTC)
- `EffectiveUntil` (DateTime UTC, nullable)
- `CentsPerKwh` (int)
- `Source` (enum: Manual, OpenEI)
- `OpenEiScheduleId` (string, nullable)
- `Notes` (string, nullable)

### AuditLog
- `Id` (long, PK)
- `Timestamp` (DateTime UTC)
- `Actor` (string — "system" or "admin")
- `Action` (string — "settings.update", "session.merge", "lifetime.adjust", "rate.auto_update", etc.)
- `Details` (string — JSON)

## Core business logic

### Session detection (this is the most important rule, get it right)

A session is defined as **a continuous period during which `HPWC.vitals.vehicle_connected == true`**.

- Poll the HPWC `/api/1/vitals` endpoint every 1 second when a session is active, every 5 seconds when idle.
- When `vehicle_connected` transitions `false → true`: open a candidate session (don't create the row yet).
- When `vehicle_connected` transitions `true → false`: close the candidate session.
- When closing: check if a previous session ended within the last `session.merge_grace_seconds` (default 60). If so, **merge** — extend the previous session's `EndedAt` and add this session's energy to the previous one. Set `IsMerged=true` on the merged session. This handles unplug-replug edge cases.
- Cycling charge (car wakes to top up battery thermal management) is naturally handled because `vehicle_connected` stays true the whole time. Do not start a new session just because `contactor_closed` toggled — only `vehicle_connected` matters for session boundaries.
- `EnergyWh` for a session = `HPWC.vitals.session_energy_wh` at the moment of session close.
- `CostCents` = `EnergyWh × RateAtStartCentsPerKwh / 100000` (since rate is in cents per kWh and energy is in Wh).
- `PeakKw` is tracked during the session by sampling instantaneous power on each poll.

### Lifetime energy tracking

The HPWC stores `lifetime.energy_wh` in non-volatile memory, and that's the **authoritative source** for lifetime kWh shown on the pump face. The app's role is:

1. Display `HPWC.lifetime.energy_wh + Settings.lifetime_offset_wh`. The offset is for cases like HPWC replacement (you can adjust it manually in admin UI to keep the displayed lifetime consistent).
2. Once per hour, snapshot the HPWC lifetime value and the computed `SUM(sessions.energy_wh)` into `LifetimeSnapshot`. Compute drift.
3. If drift exceeds 5 kWh, log a warning and surface it in the admin diagnostics page. Don't auto-correct.
4. On startup, if SQLite is empty (fresh install or restored from disaster), use `HPWC.lifetime.energy_wh` to seed the offset so the display shows the same lifetime number it did before.

### Rate management

- v1 supports both **manual flat rate** and **OpenEI auto-pull**.
- Setting `rate.source` is either `"manual"` or `"openei"`.
- If manual: `rate.flat_cents_per_kwh` is the source of truth.
- If OpenEI: weekly background job hits the OpenEI Utility Rate Database (free, requires API key the user registers for at openei.org), fetches the configured `rate.openei_schedule_id`, extracts the flat residential rate, writes a new `RateHistory` row if the value changed, and updates the displayed rate. Requires the user to set `rate.openei_api_key`.
- Default config: source = manual, rate = 13 cents/kWh (PGE residential ballpark — user will adjust).
- The user is on a flat rate, not TOU, but design the data model and rate-history storage to allow TOU later (don't lock yourself out of it). For v1, only the flat rate field is honored.
- **Critical**: when a session starts, snapshot the *then-current* rate into `Session.RateAtStartCentsPerKwh`. Cost calculation uses the snapshotted rate, not the live rate. This way, rate changes mid-bill-cycle don't retroactively affect historical session costs.

### HPWC API

The HPWC exposes these endpoints (HTTP GET, no auth, returns JSON):

- `GET http://{HPWC_HOST}/api/1/vitals` — live state. Key fields:
  - `contactor_closed` (bool)
  - `vehicle_connected` (bool)
  - `session_s` (int, seconds since session started)
  - `session_energy_wh` (float, this session's energy in watt-hours)
  - `grid_v` (float, grid voltage)
  - `grid_hz` (float)
  - `voltage_a`, `voltage_b`, `voltage_c` (float, per-phase voltage; for split-phase US installs only A and B are populated)
  - `current_a_a`, `current_b_a`, `current_c_a` (float, per-phase current in amps)
  - `relay_coil_v` (float)
  - `pcba_temp_c`, `handle_temp_c`, `mcu_temp_c` (float, temperatures)
  - `evse_state` (int — state machine code; consult community docs for meanings)

- `GET http://{HPWC_HOST}/api/1/lifetime` — durable cumulative stats:
  - `contactor_cycles` (int)
  - `contactor_cycles_loaded` (int)
  - `alert_count` (int)
  - `thermal_foldbacks` (int)
  - `avg_startup_temp` (float)
  - `charge_starts` (int)
  - `energy_wh` (long, **lifetime energy in watt-hours**) — this is what we want
  - `connector_cycles` (int)
  - `uptime_s` (long)
  - `charging_time_s` (long)

- `GET http://{HPWC_HOST}/api/1/version` — firmware info, useful for diagnostics.
- `GET http://{HPWC_HOST}/api/1/wifi_status` — connection info.

**Quirks to handle**:
- The API can become unresponsive after extended polling. Set HTTP timeout to 3 seconds, retry once on failure, and back off to 30s polls if it fails 3x in a row. Log connection state to admin diagnostics.
- The API is technically undocumented and could change in firmware updates. If a field disappears, log loudly and continue with what's available.
- During Tesla firmware updates, the HPWC may be unreachable for several minutes. Don't treat that as a permanent failure.

Compute live power as: `live_kw = (voltage_a × current_a_a + voltage_b × current_b_a) / 1000`.

### Shelly Pro EM-50 API

Local HTTP RPC. Two patterns work, prefer GET-style for simple polling:

- `GET http://{SHELLY_HOST}/rpc/EM.GetStatus?id=0` — returns combined power across both channels:
  - `total_act_power` (W)
  - `total_aprt_power` (VA)
  - `a_voltage`, `a_current`, `a_act_power`, `a_aprt_power`, `a_pf` (channel A)
  - `b_voltage`, `b_current`, `b_act_power`, `b_aprt_power`, `b_pf` (channel B)
  - `n_current` (neutral, may be null for split-phase)

- `GET http://{SHELLY_HOST}/rpc/EMData.GetStatus?id=0` — accumulated energy:
  - `total_act` (Wh, lifetime active energy across both channels)
  - `a_total_act_energy`, `b_total_act_energy`

Poll once every 5 seconds. Use as a **secondary check only** — not for session detection or primary cost calculation. If Shelly's accumulated energy diverges from HPWC's session energy by more than 5%, log a warning to diagnostics. Don't act on it automatically.

The Shelly is genuinely optional. If `shelly.host` is empty or unreachable, the app must run perfectly fine using only the HPWC data.

### OpenEI integration

API: `https://api.openei.org/utility_rates?version=8&format=json&api_key={KEY}&...`

Free API key, user registers at https://openei.org/services/api/.

Workflow:
1. In admin UI, user enters API key.
2. App searches for "Portland General Electric" utilities, presents schedule list, user picks their schedule (likely "Schedule 7 - Residential Service").
3. Schedule ID stored in settings.
4. Weekly background job pulls that schedule, extracts the flat residential rate, updates current rate if changed.
5. If the API call fails, leave the previous rate in place and log. Don't blank out the rate.
6. Provide a "test connection" button in admin UI that does a one-off pull and shows the parsed result before committing.

### Litestream

- Use Litestream for continuous SQLite replication.
- Configurable destination: local filesystem path (default `/var/backups/pumpcharger/`), or S3-style URL.
- Generate `deploy/litestream.yml` with the destination from app settings.
- Run Litestream as a separate systemd unit (don't embed it in the .NET process).
- Document the restore procedure in `docs/DEPLOYMENT.md`: stop the app, run `litestream restore`, start the app.

## Pump display UI (the kiosk view at `/pump`)

This is the most visually distinctive part of the project. It renders on both monitors (mirrored), in **portrait orientation** at **768 × 1024 effective pixels**. The display sits behind the pump's faceplate, which has cutouts at specific positions. The React layout must align dial positions to those cutouts.

### Layout (top to bottom in mounted orientation)

```
┌─────────────────────────────────────┐
│                                     │
│  THIS $  [D][D][.][D][D]  SALE      │  ← Zone 1: large 3D odometer at TOP
│                                     │     "$NNN.NN" — session $, with D-cap on right
│                                     │
│  📅  USAGE                          │  ← Zone 2: small text+emoji, rotates every 10s
│  [readout: 1234.5 kWh]              │     between lifetime / YTD / session count
│                                     │
│  ⚡  SESSION                         │  ← Zone 3: small text+emoji, rotates every 10s
│  [readout: 11.5 kW]                 │     between live kW / duration / kWh added
│                                     │     (PINS to live kW while charging — no rotate)
│                                     │
│      kWh DELIVERED                  │
│  [D][D][D][.][D]                    │  ← Zone 4: large 3D odometer, 3 digits + decimal
│                                     │     "NNN.N kWh" — session kWh, with D-cap on right
│                                     │
│      PRICE PER kWh                  │
│  $ [d][.][d][d]                     │  ← Zone 5: SMALL 3D odometer at BOTTOM
│                                     │     "$0.NN" — current rate, no D-cap, smaller scale
│                                     │
└─────────────────────────────────────┘
```

The faceplate's static labels are vinyl stickers on the physical pump, not rendered by the app. Only the values inside the cutouts are rendered. But for development/testing without a physical pump, render the labels too in a "preview mode" toggleable via URL param `?preview=true`.

### Reference photos

Photos in `docs/reference/` are authoritative for visual design — consult them before guessing:

- `faceplate-front.jpg` — the painted/labeled faceplate showing zone labels in their final positions
- `faceplate-cutouts-vertical.jpg` — bare faceplate with tape measure showing vertical cutout positions
- `faceplate-cutouts-detail-1.jpg` and `faceplate-cutouts-detail-2.jpg` — closer measurements
- `faceplate-cutouts-annotated.jpg` — bare faceplate with overlay labels confirming "This Sale" at top and "Price per kWh" at bottom in mounted orientation
- `pump-installed.jpg` — the full pump for context on overall aesthetic
- `ui-mockup-v1.png` — the user's first attempt at the UI, showing intended digit/readout style

**The cutout vertical positions in mounted orientation** (in inches from the top of the faceplate, as starting points — the user will calibrate in admin UI):

| Zone | Description | Center Y (inches from top) | Cutout size | Quantity |
|---|---|---|---|---|
| 1 | This $ Sale (large, D-cap on rightmost) | ~2.25" | ~1" × 1" each | 3 cutouts |
| 2 | USAGE slot (horizontal text readout) | ~4.7" | ~3" × 0.4" | 1 slot |
| 3 | SESSION slot (horizontal text readout) | ~5.8" | ~3" × 0.4" | 1 slot |
| 4 | kWh Delivered (large, D-cap on rightmost) | ~7.0" | ~1" × 1" each | 3 cutouts |
| 5 | Price per kWh (small squares, no D-cap) | ~9.0" | ~0.5" × 0.5" each | 3 cutouts |

Total faceplate height: 11". The display physically sits behind the faceplate covering only ~8.3" of that height in portrait, so the display has to be positioned so its visible area aligns with the cutout band (roughly inches 1.5 through 9.5 from the top of the faceplate). The exact mapping is a calibration problem at hardware-install time.

The admin settings page must include "dial position calibration" with X/Y pixel offsets per zone so the user can adjust without code changes when they actually mount the hardware behind the cutouts.

### Visual style for the odometer dials (Zones 1, 4, 5)

The hero feature. This must look genuinely like a 1950s mechanical gas pump dial. **Zones 1 and 4 are the visual centerpieces** — large cutouts (~1" each) with a D-cap on the rightmost digit. **Zone 5 (Price per kWh) uses smaller cutouts** on the actual faceplate (~0.5" each) and has no D-cap, so the OdometerDial component must be size-configurable.

- Each digit is a vertical strip of `0–9` (and a duplicated `0` at the bottom to allow a smooth wrap from 9 to 0).
- The visible window shows roughly 1.4 digit-heights — i.e., when transitioning from 3 to 4, you see the bottom of the "3" exiting the top while the top of the "4" enters from the bottom, and partial digits are visible above/below the focused one.
- Animation: when a digit value changes, animate `translateY` over ~300ms with an `ease-in-out` curve. When rolling 9 → 0, the *next-higher digit* must roll simultaneously (just like a real odometer). Cascade this leftward (9999 → 0000 cascades all four digits).
- Digit font: a chunky condensed serif numeric, evocative of vintage pump dials. Use `Bowlby One`, `Big Shoulders Display`, or self-host a free vintage-feel typeface. White digits on black background.
- For Zones 1 and 4: the rightmost digit position has a "D"-shaped end cap (matches the physical cutout). Render this as a CSS clip-path or an inline SVG mask so the digit visually appears to roll inside a half-circle window on its right edge. Zone 5 does NOT have a D-cap — its cutouts are simple squares.
- Subtle shadow at the top and bottom of the digit window to suggest the cylindrical curvature of a physical dial.
- Build this as a `<OdometerDial value={123.4} digits={3} decimals={1} size="small|large" hasDCap={true|false} />` reusable component.

### Visual style for the mini readouts (Zones 2, 3)

These two zones are the long horizontal slot cutouts in the middle of the faceplate. Match the user's mockup: small monospace digits in their own little boxes, with a leading emoji icon. Less ornate than the odometer dials. Build as `<MiniReadout icon="📅" value="1234.5" unit="kWh" />`.

The icon and value rotate every 10 seconds when idle. Possible content sets:

**Zone 2 (USAGE — upper slot) rotation**:
- 📊 lifetime kWh ("1234.5 kWh")
- 🗓️ year-to-date kWh ("234.5 kWh YTD")
- 🔢 total session count ("47 sessions")

**Zone 3 (SESSION — lower slot) rotation**:
- ⚡ live kW ("11.5 kW") — this becomes pinned (no rotation) when actively charging
- ⏱️ session duration ("0:42")
- 🔋 kWh added this session ("12.3 kWh")

Make the rotation interval configurable in admin settings (`display.mini_rotation_seconds`, default 10).

### Display states

The pump display is a state machine driven by the live data feed. Zone numbering: 1=$ Sale (top), 2=USAGE slot, 3=SESSION slot, 4=kWh Delivered, 5=Price per kWh (bottom):

| State | Trigger | Zone 1 ($ Sale) | Zone 2 (USAGE) | Zone 3 (SESSION) | Zone 4 (kWh) | Zone 5 ($/kWh) |
|---|---|---|---|---|---|---|
| Idle | `vehicle_connected=false` | $0.00 | rotating content | rotating (NOT live kW since 0) | 0.0 | live rate |
| Plugged, not charging | `vehicle_connected=true && contactor_closed=false` | $0.00 (or last) | rotating | "0.0 kW" pinned | 0.00 (or last) | live rate |
| Charging | `vehicle_connected=true && contactor_closed=true && current > 0.5A` | session $ live | rotating | live kW pinned | session kWh live | live rate |
| Session complete | `vehicle_connected=true && contactor_closed=false && session had energy > 0` | final session $ | rotating | "✓ Done" pinned | final session kWh | live rate |

Brightness modes:
- **Full brightness** in Charging and Session-complete states.
- **Dimmed** (~60% brightness via CSS filter) in Idle and Plugged-not-charging states.
- Optional: further dim overnight (configurable hours, default 11pm–6am local time) to ~30%.

### Burn-in mitigation

- Every 60 seconds, shift the entire pump-display content by ±1 pixel in a random direction, then back, so static content doesn't bake in. Imperceptible to viewer, exercises pixels.
- Once per hour during idle state, run a "dial exercise" — roll all the odometer digits through 0–9 once, then back to current values. Looks like the pump is "ticking" once an hour, period-correct vibe.

### Data flow to the display

The `PumpDisplay` page connects to a SignalR hub `/hubs/pump` on mount and receives messages of shape:

```typescript
interface PumpState {
  state: 'idle' | 'plugged_not_charging' | 'charging' | 'session_complete';
  session: {
    energyKwh: number;
    durationSeconds: number;
    costCents: number;
    liveKw: number;
  } | null;
  totals: {
    lifetimeKwh: number;
    yearToDateKwh: number;
    sessionCount: number;
  };
  rate: {
    centsPerKwh: number;
  };
  serverTime: string;  // ISO8601, used to detect stale data
  health: {
    hpwcConnected: boolean;
    shellyConnected: boolean;
    rateSource: 'manual' | 'openei';
    rateLastUpdated: string;
  };
}
```

The backend pushes this on every state change and at minimum every 1 second during charging, every 5 seconds otherwise. Frontend keeps last-received state in a Zustand store. If no message arrives for >15 seconds, the display shows a small unobtrusive "⚠ reconnecting" badge in the corner (not in any cutout area).

## Admin web UI (at `/admin`)

Auth-gated. Login page at `/admin/login`. After successful login, cookie set; if "Remember this device" is checked, cookie expires in 30 days.

### Pages

1. **`/admin`** (Dashboard): live state mirroring what the pump shows, plus power graph for the current session, plus quick stats (today's energy, this month's energy, this year's energy).

2. **`/admin/sessions`**: paginated, sortable, filterable session history. Each row shows start, duration, energy, cost, peak kW. Click into a row for detail view with a power-over-time chart (sample power every 10 seconds during the session and store as a JSON column on Session — call it `PowerSamples`, just an array of `{t, kw}` objects). Allow editing `Notes` and `IsMerged`. Allow deleting a session (with confirmation) — deleting recomputes lifetime drift on next snapshot.

3. **`/admin/settings`**: tabbed page:
   - **General**: pump name, timezone (default America/Los_Angeles), display brightness curve, mini-readout rotation interval, overnight dim hours.
   - **Hardware**: HPWC host/IP, Shelly host/IP (optional), connection test buttons.
   - **Rate**: source toggle (manual/OpenEI), manual flat rate field, OpenEI API key, OpenEI utility/schedule picker (search → select), test pull button.
   - **Session**: merge grace seconds (default 60), idle threshold (current below which to consider not-charging, default 0.5A).
   - **Backup**: Litestream destination (local path or S3-style URL), last replication timestamp.
   - **Lifetime**: current displayed lifetime, current HPWC lifetime, current drift, manual offset adjustment with reason field (logged to AuditLog).
   - **Account**: change admin password.

4. **`/admin/diagnostics`**:
   - Connection status: HPWC, Shelly, OpenEI, Litestream. Each shows last-success timestamp, last-error timestamp + message.
   - Recent log tail (last 200 lines from Serilog).
   - "Force HPWC poll" / "Force Shelly poll" / "Force rate refresh" buttons.
   - Drift history chart (LifetimeSnapshot data).

5. **`/admin/audit`**: AuditLog browser, paginated, filterable by actor and action.

Visual style: clean, modern, neutral — no need to match the vintage aesthetic in admin. Tailwind defaults are fine. Mobile-responsive (the user will use this from a phone).

## Authentication implementation details

- Single admin account, no usernames — just a password.
- First-run experience: if no admin password is set, redirect all `/admin` requests to `/admin/setup` which forces password creation.
- Password stored as a BCrypt hash (work factor 11) in `Setting` table under key `admin.password_hash`.
- Login endpoint: `POST /api/auth/login` with `{password, rememberDevice}`. On success, set HttpOnly + Secure (in production) + SameSite=Strict cookie.
- All `/api/admin/**` and `/admin/**` routes require auth.
- `/api/pump/**` and `/pump` (kiosk view) and the SignalR `/hubs/pump` are NOT authenticated — they're read-only and the kiosk needs to load without credentials.
- Rate-limit the login endpoint: 5 attempts per IP per 15 minutes, then 15-minute lockout. Log lockouts to AuditLog.

## SignalR contract

Hub: `/hubs/pump` (no auth)
- Server pushes `pumpState` events with the `PumpState` payload above.

Hub: `/hubs/admin` (auth required)
- Server pushes `pumpState` events (same as pump hub)
- Server pushes `diagnosticsUpdate` events with health info
- Server pushes `auditLogEntry` events for live log tail

## Background services (HostedService implementations)

Run all of these as `BackgroundService`-derived classes registered in `Program.cs`:

1. **HpwcPollerService** — adaptive polling (1s during session, 5s idle), publishes to internal event bus on change.
2. **ShellyPollerService** — 5s polling, publishes to internal event bus, no-op if not configured.
3. **SessionManagerService** — subscribes to HpwcPollerService events, manages session lifecycle including merge logic.
4. **RatePullerService** — runs daily at 03:00 local, pulls OpenEI if configured.
5. **LifetimeSnapshotService** — runs hourly + on session close, writes `LifetimeSnapshot` rows.
6. **DisplayBroadcastService** — subscribes to all the above, debounces, pushes `pumpState` to SignalR hubs.

Use `Channel<T>` for inter-service messaging, not direct method calls. This keeps services decoupled and testable.

## Configuration

Use `appsettings.json` + environment variable overrides + database settings (in that priority order, highest last). Critical bootstrap settings (db path, listen port, log path) come from appsettings/env. Operational settings (HPWC host, rate, etc.) come from the `Setting` table via the admin UI.

Example `appsettings.json`:

```json
{
  "Kestrel": {
    "Endpoints": {
      "Http": { "Url": "http://0.0.0.0:5000" }
    }
  },
  "Database": {
    "Path": "/var/lib/pumpcharger/pumpcharger.db"
  },
  "Logging": {
    "Path": "/var/log/pumpcharger/"
  },
  "Pump": {
    "DefaultTimezone": "America/Los_Angeles",
    "DefaultRateCentsPerKwh": 13
  }
}
```

## Deployment

Provide:

1. **`deploy/install.sh`** — idempotent installer. Installs .NET 8 runtime, creates the `pumpcharger` system user, creates `/var/lib/pumpcharger`, `/var/log/pumpcharger`, `/var/backups/pumpcharger`, copies the published binaries to `/opt/pumpcharger`, installs the systemd unit, configures display rotation and kiosk launcher, sets up Litestream as a separate systemd unit. Documented to be run as root on a fresh Pi 5.

2. **`deploy/pumpcharger.service`** — systemd unit. `Restart=always`, `RestartSec=5`, runs as `pumpcharger` user, `WorkingDirectory=/opt/pumpcharger`, `ExecStart=/opt/pumpcharger/PumpCharger.Api`.

3. **`deploy/pumpcharger-litestream.service`** — separate systemd unit for Litestream.

4. **`deploy/kiosk-launch.sh`** — launches Chromium in kiosk mode on the Pi's user session. Includes flags: `--kiosk --noerrdialogs --disable-infobars --disable-features=TranslateUI --no-first-run --autoplay-policy=no-user-gesture-required --start-fullscreen --app=http://localhost:5000/pump`. Configured to auto-start on the Pi user's graphical session.

5. **`deploy/display-setup.sh`** — uses `wlr-randr` (Wayland) or `xrandr` (X11) to rotate both HDMI outputs to portrait and configure mirroring. Detect which display server is active first.

6. **`docs/DEPLOYMENT.md`** — full step-by-step from a fresh Pi OS install: enable SSH, set up SSD boot, run `install.sh`, find HPWC IP, find Shelly IP, configure router reservations, first-run setup wizard. Include a backup/restore section using Litestream.

## Build & run

`README.md` should include:

```bash
# Backend dev
cd src/PumpCharger.Api
dotnet restore
dotnet ef database update
dotnet run

# Frontend dev (separate terminal)
cd web
npm install
npm run dev   # Vite serves on 5173, proxies /api and /hubs to localhost:5000

# Tests
cd src/PumpCharger.Tests
dotnet test

# Production build
cd web && npm run build   # outputs to ../src/PumpCharger.Api/wwwroot/
cd ../src/PumpCharger.Api && dotnet publish -c Release -r linux-arm64 --self-contained -o /tmp/publish
```

Configure the .NET project to copy `web/dist/` into `wwwroot/` as part of the publish step.

## Testing

Required test coverage:

- Unit tests for session detection logic (mock HPWC poller, fire `vehicle_connected` transitions, assert sessions are created/merged correctly including the grace-window edge case).
- Unit tests for cost calculation including rate-snapshot behavior.
- Integration test: spin up an in-memory SQLite, run the full poller-to-session pipeline against a fake HPWC HTTP server, assert end-to-end correctness.
- Integration test for OpenEI rate parsing using a captured real response (commit a fixture file).
- Frontend: a few component tests for the OdometerDial (value transitions, cascade on 9→0).

GitHub Actions workflow at `.github/workflows/ci.yml`: build backend, run tests, build frontend, smoke-test the published artifact.

## What NOT to build

To keep scope bounded:

- **No cloud dependencies** beyond OpenEI. No Tesla cloud API, no Shelly Cloud, no AWS IoT, nothing that requires an account other than OpenEI.
- **No charge control**. The HPWC API is read-only and we keep it that way. Don't add any "stop charging" / "limit current" features.
- **No multi-user or multi-pump support**. Single user, single pump.
- **No mobile app**. The admin web UI works on phones; that's enough.
- **No notifications, SMS, email, push**. The user will look at the pump or the web UI when curious.
- **No payment processing**. Personal home use.
- **No firmware update mechanism for the pump itself**. Updates happen via SSH + redeploy.
- **No Tesla account integration**. The HPWC's local API gives us everything we need.

If during build you find yourself adding any of the above, stop and confirm with the user.

## Implementation order suggestion

If you're going to phase the build, suggested order. **Local-dev-first**: the user is building before any hardware is installed, so phases 1-7 must all work end-to-end on a laptop with the fake clients.

1. **Foundation**: solution structure, EF migrations, basic Program.cs, health endpoint, README, CI pipeline.
2. **Interface + fake-first**: define `IHpwcClient` / `IShellyClient` / `IOpenEiClient` interfaces; build the **fake implementations first**, including the realistic-cycle simulator with time acceleration and the demo-control endpoints. Get fake data flowing end-to-end through SignalR before writing any real HTTP client.
3. **Session detection**: SessionManagerService with merge logic, full unit tests of state transitions, validated against the fake client.
4. **SignalR + minimal pump display**: get the data flowing end-to-end with ugly placeholder digits in a desktop browser. Validates the architecture before investing in the visual polish.
5. **Odometer dial component**: build the visual centerpiece. Iterate until it looks right at 768×1024.
6. **Mini readouts + rotation logic + display states**.
7. **Admin UI**: auth, dashboard, sessions, settings, demo-control panel for fake mode. **At end of this phase, the local-dev acceptance criterion above must pass.**
8. **Real HPWC HTTP client**: implement against the real API contract documented above. Test with the user's actual device when they have it hooked up.
9. **Real Shelly client**: same approach.
10. **OpenEI integration**: real API calls, schedule picker, weekly background pull.
11. **Burn-in mitigation, diagnostics, audit log, lifetime snapshots**.
12. **Litestream + deploy scripts**.
13. **Documentation pass + testing pass**.

Commit at the end of each phase with a clear message. Use feature branches off `main` if helpful, but `main` should be deployable at all times.

## Acceptance criteria for v1 done

- [ ] `git checkout main && bash deploy/install.sh` on a fresh Pi 5 produces a working install
- [ ] HPWC polling works against the real device, session detection is correct including cycling-charge edge cases
- [ ] Pump display renders at 768×1024 portrait, all 5 zones working, odometer animation looks period-correct
- [ ] Mini readouts rotate when idle, pin to live kW when charging
- [ ] Display states transition correctly across the full charge lifecycle
- [ ] Both HDMI outputs show identical mirrored content
- [ ] Admin UI auth works, all settings persist, OpenEI rate pull works (or graceful degradation if no API key)
- [ ] Litestream is replicating; documented restore procedure tested
- [ ] All listed tests pass in CI
- [ ] Lifetime kWh shown on display matches `HPWC.lifetime.energy_wh + offset` with drift logged
- [ ] After a Pi reboot mid-session, display reconnects and reflects current state correctly
- [ ] After clearing SQLite (simulated disaster), startup reseeds lifetime from HPWC and shows sensible numbers

---

That's the spec. Build it.
