# Esso Charger Project

A vintage 1950s Esso gas pump converted into a Tesla EV charger station.
Backend is .NET 8 + ASP.NET Core + EF Core + SQLite. Frontend is React 18 +
Vite + TypeScript + Tailwind. Designed to run on a Raspberry Pi 5 inside the
pump in production, fully demoable on a developer laptop with simulated
hardware in development.

The complete project specification lives in [docs/BUILD_SPEC.md](docs/BUILD_SPEC.md).

## Repository status

This is the **Phase 1 foundation**: solution scaffold, entities and EF
migrations, Program.cs wiring, a `/api/health` endpoint, a Vite + React +
Tailwind frontend skeleton, and CI. None of the charging logic, fake or real
clients, SignalR hubs, or pump-display visuals exist yet — those come in
later phases per the build spec.

A previous attempt is preserved on the `v1` branch for reference.

## Layout

```
src/
  PumpCharger.sln
  PumpCharger.Core/    – domain POCOs, no infra deps
  PumpCharger.Api/     – ASP.NET Core host
  PumpCharger.Tests/   – xUnit
web/                   – Vite + React + TypeScript + Tailwind
docs/                  – build spec lives here
.github/workflows/     – CI pipeline
```

## Prerequisites

- .NET 8 SDK (`dotnet --version` ≥ 8.0)
- Node 20+ (`node --version` ≥ 20)
- `dotnet-ef` global tool: `dotnet tool install --global dotnet-ef`

## Run locally

In one terminal:

```bash
cd src/PumpCharger.Api
dotnet run
```

The API listens on **http://localhost:5050** in development.
(Production uses port 5000; macOS ships AirPlay Receiver on that port,
which is why dev is shifted to 5050.)

In a second terminal:

```bash
cd web
npm install
npm run dev
```

Then open http://localhost:5173. You should see the Phase 1 health-check
panel pulling from `GET /api/health` through Vite's dev proxy.

## EF Core migrations

Migrations live in `src/PumpCharger.Api/Data/Migrations/`. The app applies
pending migrations on startup automatically, but you can run them by hand:

```bash
cd src/PumpCharger.Api
dotnet ef database update
```

The dev database file lives at `src/PumpCharger.Api/var/pumpcharger.db`
(gitignored). Production uses `/var/lib/pumpcharger/pumpcharger.db`.

## Tests

```bash
cd src
dotnet test PumpCharger.sln
```

## Production build

```bash
cd web && npm run build
cd ../src/PumpCharger.Api && dotnet publish -c Release -r linux-arm64 --self-contained -o /tmp/publish
```

The Vite build will eventually be wired into the .NET publish step so the
React app is served from Kestrel. For Phase 1, frontend and backend are run
side-by-side via the Vite dev proxy.

## Configuration

`appsettings.json` holds production defaults with placeholder values for
hardware integrations (`REPLACE_WITH_HPWC_IP_OR_HOSTNAME`, etc.) — fill
these in before deploying to the Pi.

`appsettings.Development.json` is committed and uses fake-mode flags
(`Hpwc.Mode = "Fake"`, etc.). Phase 1 does not yet read those flags; the
fake clients themselves arrive in Phase 2.

Reference photos referenced by the build spec belong in `docs/reference/`.
That directory is gitignored for image files (they're large and personal);
drop them in locally with the filenames listed in the spec.
