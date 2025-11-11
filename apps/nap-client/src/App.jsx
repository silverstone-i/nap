import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LayoutShell from './layout/LayoutShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ManageTenantsPage from './pages/tenant/ManageTenantsPage.jsx';
import ManageUsersPage from './pages/tenant/ManageUsersPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<LayoutShell />}>
          <Route index element={<Navigate to="/tenant/manage-tenants" replace />} />
          <Route path="/tenant/manage-tenants" element={<ManageTenantsPage />} />
          <Route path="/tenant/manage-users" element={<ManageUsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/tenant/manage-tenants" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
