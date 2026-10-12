import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminApp } from './admin/AdminApp';
import { GuestApp } from './guest/GuestApp';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<GuestApp />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
