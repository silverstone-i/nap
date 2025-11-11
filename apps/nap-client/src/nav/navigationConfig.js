import ApartmentIcon from '@mui/icons-material/Apartment';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';

export const NAV_ITEMS = [
  {
    id: 'tenant-admin',
    label: 'Tenant',
    icon: ApartmentIcon,
    path: '/tenant/manage-tenants',
    modules: [
      { id: 'tenant-manage-tenants', label: 'Manage Tenants', path: '/tenant/manage-tenants' },
      { id: 'tenant-manage-users', label: 'Manage Users', path: '/tenant/manage-users', icon: PeopleAltIcon },
    ],
  },
];

const hasCapability = (capabilities = []) => (requiredCap) => {
  if (!requiredCap) return true;
  if (!Array.isArray(capabilities) || capabilities.length === 0) return true;
  return capabilities.includes(requiredCap);
};

export function buildNavigationConfig(capabilities) {
  const can = hasCapability(capabilities);
  return NAV_ITEMS.filter((primary) => can(primary.capability)).map((primary) => ({
    ...primary,
    modules: (primary.modules || []).filter((module) => can(module.capability)),
  }));
}
