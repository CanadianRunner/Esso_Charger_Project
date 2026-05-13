import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './routes/Home';
import PumpDisplay from './routes/PumpDisplay';
import AdminLogin from './routes/admin/AdminLogin';
import AdminSetup from './routes/admin/AdminSetup';
import AdminShell from './routes/admin/AdminShell';
import AdminDashboard from './routes/admin/AdminDashboard';
import AdminSessions from './routes/admin/AdminSessions';
import DialsPreview from './routes/DialsPreview';

// Placeholder until commit 4 adds the real session detail page + chart.
function SessionDetailPlaceholder() {
  return <p className="text-neutral-400 text-sm">Session detail coming next.</p>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pump" element={<PumpDisplay />} />

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/setup" element={<AdminSetup />} />
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<AdminDashboard />} />
          <Route path="sessions" element={<AdminSessions />} />
          <Route path="sessions/:id" element={<SessionDetailPlaceholder />} />
        </Route>

        <Route path="/dev/dials" element={<DialsPreview />} />
      </Routes>
    </BrowserRouter>
  );
}
