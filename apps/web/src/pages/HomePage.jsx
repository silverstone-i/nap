/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Typography from '@mui/material/Typography';
import { useSession } from '../auth/SessionContext.jsx';
import { usePageHeader } from '../shell/PageHeaderContext.jsx';

/**
 * `/home` (I0001-R014): the one Home work area. It names the selected
 * tenant, or says none is selected; it shows no invented metrics.
 */
export function HomePage() {
  const session = useSession();
  usePageHeader({ title: 'Home' });
  return (
    <Typography variant="body1" color="text.secondary">
      {session.selectedTenant
        ? `${session.selectedTenant.name} workspace.`
        : 'No tenant selected.'}
    </Typography>
  );
}
