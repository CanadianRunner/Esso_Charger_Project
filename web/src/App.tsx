import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './routes/Home';
import PumpDisplay from './routes/PumpDisplay';
import AdminPlaceholder from './routes/AdminPlaceholder';
import AdminLogin from './routes/admin/AdminLogin';
import AdminSetup from './routes/admin/AdminSetup';
import AdminShell from './routes/admin/AdminShell';
import DialsPreview from './routes/DialsPreview';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pump" element={<PumpDisplay />} />

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/setup" element={<AdminSetup />} />
        <Route
          path="/admin/*"
          element={
            <AdminShell>
              <AdminPlaceholder />
            </AdminShell>
          }
        />

        <Route path="/dev/dials" element={<DialsPreview />} />
      </Routes>
    </BrowserRouter>
  );
}
