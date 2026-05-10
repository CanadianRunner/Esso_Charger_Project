import { useEffect, useState } from 'react';
import { OdometerDial } from '../components/dials';

export default function DialsPreview() {
  const [animated, setAnimated] = useState(0);
  const [wrapDemo, setWrapDemo] = useState(8);

  useEffect(() => {
    const id = setInterval(() => setAnimated((v) => +(v + 0.1).toFixed(1)), 600);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setWrapDemo((v) => (v + 1) % 10), 800);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-10 space-y-12">
      <header>
        <h1 className="text-3xl font-semibold">Odometer Dial Preview</h1>
        <p className="text-neutral-400 mt-1">Static and animated samples for visual review.</p>
      </header>

      <Section title="Zone 1 layout — large 4-digit + 2 decimals + D-cap (THIS $ SALE)">
        <div className="flex items-center gap-4">
          <Label>$</Label>
          <OdometerDial value={123.45} digits={2} decimals={2} size="large" hasDCap />
          <Label>SALE</Label>
        </div>
      </Section>

      <Section title="Zone 4 layout — large 3-digit + 1 decimal + D-cap (kWh DELIVERED)">
        <OdometerDial value={234.5} digits={3} decimals={1} size="large" hasDCap />
      </Section>

      <Section title="Zone 5 layout — small 1-digit + 2 decimals, no D-cap (PRICE PER kWh)">
        <div className="flex items-center gap-2">
          <Label>$</Label>
          <OdometerDial value={0.13} digits={1} decimals={2} size="small" />
        </div>
      </Section>

      <Section title="Static digit grid (large) — 0..9">
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <OdometerDial key={d} value={d} digits={1} decimals={0} size="large" />
          ))}
        </div>
      </Section>

      <Section title="Animated — counts 0.1 every 600ms">
        <OdometerDial value={animated} digits={3} decimals={1} size="large" hasDCap />
      </Section>

      <Section title="Wrap demo — single digit cycling 0..9 → 0 every 800ms">
        <OdometerDial value={wrapDemo} digits={1} decimals={0} size="large" />
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm uppercase tracking-widest text-neutral-500 mb-3">{title}</h2>
      <div className="flex">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-4xl font-bold text-white">{children}</span>;
}
