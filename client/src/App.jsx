import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './ui/Layout.jsx';
import { Login, Signup, Forgot } from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import OperationsList from './pages/OperationsList.jsx';
import OperationForm from './pages/OperationForm.jsx';
import PrintOperation from './pages/PrintOperation.jsx';
import Stock from './pages/Stock.jsx';
import MoveHistory from './pages/MoveHistory.jsx';
import { Warehouses, Locations } from './pages/Settings.jsx';
import Profile from './pages/Profile.jsx';

function Private({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="loader">Opening the warehouse</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function PublicOnly({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
      <Route path="/forgot" element={<PublicOnly><Forgot /></PublicOnly>} />
      <Route path="/print/:id" element={<Private><PrintOperation /></Private>} />
      <Route element={<Private><Layout /></Private>}>
        <Route index element={<Dashboard />} />
        <Route path="operations/:slug" element={<OperationsList />} />
        <Route path="operations/:slug/new" element={<OperationForm />} />
        <Route path="operations/:slug/:id" element={<OperationForm />} />
        <Route path="products" element={<Stock />} />
        <Route path="moves" element={<MoveHistory />} />
        <Route path="settings/warehouses" element={<Warehouses />} />
        <Route path="settings/locations" element={<Locations />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
