import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import GroupView from './pages/GroupView.jsx';
import AddExpense from './pages/AddExpense.jsx';
import Admin from './pages/Admin.jsx';
import GroupStatistics from './pages/GroupStatistics.jsx';
import AppShell from './components/AppShell.jsx';
import { parseUser } from './lib/session.js';

function ProtectedRoute() {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

function AdminRoute() {
  const user = parseUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!user.is_admin) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/groups/:slug" element={<GroupView />} />
          <Route path="/groups/:slug/statistics" element={<GroupStatistics />} />
          <Route path="/groups/:slug/expenses/new" element={<AddExpense />} />
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
