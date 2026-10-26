/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Typography from '@mui/material/Typography';
import { usePageHeader } from '../shell/PageHeaderContext.jsx';

/**
 * `/home` (I0001-R014, R045): the landing page after sign-in, holding the
 * dashboard's place until it exists. The header already names the tenant.
 */
export function HomePage() {
  usePageHeader({ title: 'Home' });
  return (
    <Typography variant="body1" color="text.secondary">
      Your dashboard will appear here.
    </Typography>
  );
}
