import { useEffect, useState } from 'react';

interface HealthResponse {
  status: string;
  time: string;
  version: string;
  database: { reachable: boolean };
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as HealthResponse;
        if (!cancelled) {
          setHealth(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-6">
        <header>
          <h1 className="text-3xl font-semibold">PumpCharger</h1>
          <p className="text-neutral-400 mt-1">
            Phase 1 foundation — backend health check.
          </p>
        </header>

        <section className="rounded border border-neutral-800 bg-neutral-900 p-4 font-mono text-sm">
          {health ? (
            <>
              <Row label="status" value={health.status} />
              <Row label="version" value={health.version} />
              <Row label="db reachable" value={String(health.database.reachable)} />
              <Row label="server time" value={health.time} />
            </>
          ) : error ? (
            <p className="text-red-400">unreachable: {error}</p>
          ) : (
            <p className="text-neutral-400">connecting…</p>
          )}
        </section>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-neutral-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}
