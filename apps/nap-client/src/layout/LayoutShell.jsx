import { useEffect, useMemo, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import TenantBar from './TenantBar.jsx';
import ModuleBar from './ModuleBar.jsx';
import napLogo from '../assets/nap-logo-dark.svg';
import { buildNavigationConfig } from '../nav/navigationConfig.js';
import { useAuth } from '../context/AuthContext.jsx';

const TENANT_BAR_HEIGHT = 48;

export default function LayoutShell() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const navigationItems = useMemo(() => buildNavigationConfig(user?.capabilities), [user?.capabilities]);

  const tenantOptions = useMemo(() => {
    if (Array.isArray(user?.tenants) && user.tenants.length) {
      return user.tenants.map((tenant) => ({
        id: tenant.id || tenant.code || tenant.tenant_code || tenant.name,
        label: tenant.name || tenant.label || tenant.code,
      }));
    }
    if (user?.tenant) {
      return [{ id: 'primary', label: user.tenant }];
    }
    return [
      { id: 'nap-hq', label: 'NAP HQ' },
      { id: 'nap-emea', label: 'NAP EMEA' },
    ];
  }, [user]);

  const [activeTenantId, setActiveTenantId] = useState(() => tenantOptions[0]?.id ?? null);

  useEffect(() => {
    setActiveTenantId(tenantOptions[0]?.id ?? null);
  }, [tenantOptions]);

  const activeNav = useMemo(() => {
    let primaryId = navigationItems[0]?.id ?? null;
    let moduleId = navigationItems[0]?.modules?.[0]?.id ?? null;
    let longestMatch = -1;

    navigationItems.forEach((primary) => {
      const primaryMatches = location.pathname.startsWith(primary.path);
      if (primaryMatches && primary.path.length > longestMatch) {
        primaryId = primary.id;
        moduleId = primary.modules?.[0]?.id ?? null;
        longestMatch = primary.path.length;
      }

      (primary.modules || []).forEach((module) => {
        if (location.pathname.startsWith(module.path) && module.path.length > longestMatch) {
          primaryId = primary.id;
          moduleId = module.id;
          longestMatch = module.path.length;
        }
      });
    });

    return { primaryId, moduleId };
  }, [location.pathname, navigationItems]);

  const handlePrimarySelect = (item) => {
    const targetPath = item.modules?.[0]?.path || item.path;
    if (targetPath) navigate(targetPath);
  };

  const handleModuleSelect = (module) => {
    if (module.path) navigate(module.path);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Sidebar
        logo={napLogo}
        items={navigationItems}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((prev) => !prev)}
        activePrimaryId={activeNav.primaryId}
        activeModuleId={activeNav.moduleId}
        onPrimarySelect={handlePrimarySelect}
        onModuleSelect={handleModuleSelect}
      />
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <TenantBar
          tenants={tenantOptions}
          activeTenantId={activeTenantId}
          onTenantChange={setActiveTenantId}
          session={user}
          onSignOut={logout}
          height={TENANT_BAR_HEIGHT}
        />
        <ModuleBar offsetTop={TENANT_BAR_HEIGHT} />
        <Box component="main" sx={{ flex: 1, p: 3 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
