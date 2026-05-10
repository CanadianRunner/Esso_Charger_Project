import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Home from './routes/Home';
import PumpDisplay from './routes/PumpDisplay';
import AdminPlaceholder from './routes/AdminPlaceholder';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pump" element={<PumpDisplay />} />
        <Route path="/admin/*" element={<AdminPlaceholder />} />
      </Routes>
    </BrowserRouter>
  );
}
