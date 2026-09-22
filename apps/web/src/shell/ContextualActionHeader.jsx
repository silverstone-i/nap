/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { usePageHeaderValue } from './PageHeaderContext.jsx';

/**
 * The row above the work area where the active destination supplies its
 * title and actions (F0001 §5, R009).
 * @param {{headingRef: import('react').Ref<HTMLHeadingElement>}} props
 * @returns {JSX.Element}
 */
export function ContextualActionHeader({ headingRef }) {
  const { title, actions } = usePageHeaderValue();
  return (
    <Stack
      direction="row"
      sx={{
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 3,
        py: 2,
        borderBottom: 1,
        borderColor: 'divider',
        minHeight: 64,
      }}
    >
      <Typography
        component="h1"
        variant="h1"
        ref={headingRef}
        tabIndex={-1}
        sx={{ outline: 'none' }}
      >
        {title}
      </Typography>
      {actions ? <Box>{actions}</Box> : null}
    </Stack>
  );
}
