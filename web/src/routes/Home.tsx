import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-6 text-center">
        <header>
          <h1 className="text-3xl font-semibold">PumpCharger</h1>
          <p className="text-neutral-400 mt-1">Pick a view.</p>
        </header>

        <nav className="grid grid-cols-1 gap-3">
          <Link to="/pump" className="rounded border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-700">
            <div className="font-mono">/pump</div>
            <div className="text-sm text-neutral-400">Kiosk view (768×1024 portrait)</div>
          </Link>
          <Link to="/admin" className="rounded border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-700">
            <div className="font-mono">/admin</div>
            <div className="text-sm text-neutral-400">Admin (placeholder)</div>
          </Link>
          <Link to="/dev/dials" className="rounded border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-700">
            <div className="font-mono">/dev/dials</div>
            <div className="text-sm text-neutral-400">Odometer dial preview</div>
          </Link>
        </nav>
      </div>
    </main>
  );
}
