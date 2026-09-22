/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Typography from '@mui/material/Typography';
import { useSession } from '../auth/SessionContext.jsx';
import { usePageHeader } from '../shell/PageHeaderContext.jsx';

/** Minimal tenant Home — a context label only, no invented metrics (F0001-R014). */
export function TenantHome() {
  const session = useSession();
  usePageHeader({ title: 'Home' });
  return (
    <Typography variant="body1" color="text.secondary">
      {session.selectedTenant?.name} workspace.
    </Typography>
  );
}
