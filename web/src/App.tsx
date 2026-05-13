import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './routes/Home';
import PumpDisplay from './routes/PumpDisplay';
import AdminLogin from './routes/admin/AdminLogin';
import AdminSetup from './routes/admin/AdminSetup';
import AdminShell from './routes/admin/AdminShell';
import AdminDashboard from './routes/admin/AdminDashboard';
import AdminSessions from './routes/admin/AdminSessions';
import AdminSessionDetail from './routes/admin/AdminSessionDetail';
import AdminSettings from './routes/admin/AdminSettings';
import DialsPreview from './routes/DialsPreview';

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
          <Route path="sessions/:id" element={<AdminSessionDetail />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        <Route path="/dev/dials" element={<DialsPreview />} />
      </Routes>
    </BrowserRouter>
  );
}
