/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useLocation, useNavigate } from 'react-router';
import BusinessIcon from '@mui/icons-material/Business';
import ContactPhoneIcon from '@mui/icons-material/ContactPhone';
import ContactsIcon from '@mui/icons-material/Contacts';
import HandshakeIcon from '@mui/icons-material/Handshake';
import LabelIcon from '@mui/icons-material/Label';
import StoreIcon from '@mui/icons-material/Store';
import BadgeIcon from '@mui/icons-material/Badge';
import CorporateFareIcon from '@mui/icons-material/CorporateFare';
import DomainIcon from '@mui/icons-material/Domain';
import HomeIcon from '@mui/icons-material/Home';
import PeopleIcon from '@mui/icons-material/People';
import SecurityIcon from '@mui/icons-material/Security';
import SettingsIcon from '@mui/icons-material/Settings';
import StorageIcon from '@mui/icons-material/Storage';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import { useSession } from '../auth/SessionContext.jsx';
import { NavGroup } from './NavGroup.jsx';
import { NavItem } from './NavItem.jsx';
import {
  TENANT_MANAGEMENT_CHILDREN,
  visibleTenantManagementChildren,
} from './tenantManagementNav.js';
import {
  ORGANIZATION_SETUP_CHILDREN,
  visibleOrganizationSetupChildren,
} from './organizationSetupNav.js';
import { SETTINGS_CHILDREN, visibleSettingsChildren } from './settingsNav.js';
import { Wordmark } from './Wordmark.jsx';

/** Width of the expanded nav (icons and labels). */
export const NAV_WIDTH = 240;
/** Width of the collapsed rail (icons only) at tablet and desktop. */
export const NAV_RAIL_WIDTH = 72;

/** The one Home route (I0001-R014). */
const HOME_PATH = '/home';

/** Icon for each `Tenant Management` child, by id — a display concern kept out of `tenantManagementNav.js`'s data. */
const CHILD_ICONS = {
  tenants: <BusinessIcon fontSize="small" />,
  cells: <StorageIcon fontSize="small" />,
  'portal-users': <PeopleIcon fontSize="small" />,
};

/** Icon for each `Organization Setup` child, by id. */
const SETUP_ICONS = {
  employees: <BadgeIcon fontSize="small" />,
  contacts: <ContactsIcon fontSize="small" />,
  vendors: <StoreIcon fontSize="small" />,
  clients: <HandshakeIcon fontSize="small" />,
};

/** Icon for each `Settings` child, by id. */
const SETTINGS_ICONS = {
  roles: <SecurityIcon fontSize="small" />,
  'tenant-contacts': <ContactPhoneIcon fontSize="small" />,
  labels: <LabelIcon fontSize="small" />,
};

/**
 * The left navigation area: implemented destinations only (Business Rules
 * §7 — "no placeholder or unavailable destination"), capped at two levels
 * (no breadcrumbs, I0001-R010, I0001-R023), with the `nap.` wordmark pinned
 * to the bottom.
 *
 * At tablet and desktop the hamburger toggles `expanded` between the full
 * width (icons and labels) and a narrow icon-only rail, without ever fully
 * hiding navigation. At phone widths it is a modal drawer (icons and
 * labels) the hamburger opens and closes.
 * @param {{variant: 'rail'|'temporary', expanded?: boolean, open?: boolean, onClose?: () => void}} props
 * @returns {JSX.Element}
 */
export function NavDrawer({ variant, expanded, open, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSession();
  const active = location.pathname === HOME_PATH;
  const showLabels = variant === 'temporary' || expanded;

  // I0001-R023: Tenant Management lists the implemented children the server
  // authorizes, whether or not a tenant is selected (one shell, R009).
  const tenantManagementChildren = visibleTenantManagementChildren(
    session.capabilities
  ).map(child => ({
    ...child,
    icon: CHILD_ICONS[child.id],
    active: location.pathname === child.path,
  }));

  // M0005-R026: directory screens for the selected tenant.
  const organizationSetupChildren = visibleOrganizationSetupChildren(
    session.capabilities
  ).map(child => ({
    ...child,
    icon: SETUP_ICONS[child.id],
    active: location.pathname === child.path,
  }));

  // The selected tenant's roles, own contacts, and labels.
  const settingsChildren = visibleSettingsChildren(session.capabilities).map(
    child => ({
      ...child,
      icon: SETTINGS_ICONS[child.id],
      active: location.pathname === child.path,
    })
  );

  const goTo = path => {
    navigate(path);
    onClose?.();
  };

  const content = (
    <Box
      sx={{
        width: variant === 'temporary' ? NAV_WIDTH : 'auto',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <List sx={{ flex: 1 }}>
        <NavItem
          icon={<HomeIcon fontSize="small" />}
          label="Home"
          active={active}
          expanded={showLabels}
          onClick={() => goTo(HOME_PATH)}
        />
        <NavGroup
          icon={<DomainIcon fontSize="small" />}
          label="Tenant Management"
          expanded={showLabels}
          children={tenantManagementChildren}
          onSelect={id => {
            const child = TENANT_MANAGEMENT_CHILDREN.find(c => c.id === id);
            if (child) goTo(child.path);
          }}
        />
        <NavGroup
          icon={<CorporateFareIcon fontSize="small" />}
          label="Organization Setup"
          expanded={showLabels}
          children={organizationSetupChildren}
          onSelect={id => {
            const child = ORGANIZATION_SETUP_CHILDREN.find(c => c.id === id);
            if (child) goTo(child.path);
          }}
        />
        <NavGroup
          icon={<SettingsIcon fontSize="small" />}
          label="Settings"
          expanded={showLabels}
          children={settingsChildren}
          onSelect={id => {
            const child = SETTINGS_CHILDREN.find(c => c.id === id);
            if (child) goTo(child.path);
          }}
        />
      </List>
      <Box
        sx={{
          p: showLabels ? 2 : 1,
          display: 'flex',
          justifyContent: showLabels ? 'flex-start' : 'center',
        }}
      >
        <Wordmark fontSize={showLabels ? '20px' : '15px'} />
      </Box>
    </Box>
  );

  if (variant === 'temporary')
    return (
      <Drawer
        variant="temporary"
        open={open}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
      >
        {content}
      </Drawer>
    );

  const width = expanded ? NAV_WIDTH : NAV_RAIL_WIDTH;
  return (
    <Drawer
      variant="permanent"
      sx={theme => ({
        width,
        flexShrink: 0,
        transition: theme.transitions.create('width'),
        [`& .MuiDrawer-paper`]: {
          position: 'relative',
          width,
          overflowX: 'hidden',
          height: '100%',
          boxSizing: 'border-box',
          transition: theme.transitions.create('width'),
        },
      })}
    >
      {content}
    </Drawer>
  );
}
