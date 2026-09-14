/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useEffect, useState } from 'react';
import { Alert, Box, Button, Stack, Toolbar, Typography } from '@mui/material';
import type { auditResponseSchema } from '@nap/shared';
import type { z } from 'zod';
import { getAudit } from '../api/control.js';
import { managementHeaderStyles } from '../theme/styles.js';
/** Does: Shows the bounded immutable platform audit history. Called by: the permission-gated management Audit route. */
export function ManagementAuditPage() {
  const [events, setEvents] = useState<
    z.infer<typeof auditResponseSchema>['data']
  >([]);
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void getAudit().then(result => {
      if (!active) return;
      setEvents(result.ok ? result.body.data : []);
      setMessage(result.ok ? '' : result.error.message);
    });
    return () => {
      active = false;
    };
  }, [revision]);
  return (
    <Box>
      <Toolbar sx={managementHeaderStyles}>
        <Typography component="h1" variant="h5">
          Audit
        </Typography>
        <Button onClick={() => setRevision(v => v + 1)}>Refresh</Button>
      </Toolbar>
      <Stack spacing={2} sx={{ p: 3 }}>
        {message && <Alert severity="error">{message}</Alert>}
        <Typography>Up to 200 recent platform events.</Typography>
        {events.map(event => (
          <Typography key={event.id}>
            {event.created_at} — {event.event} — Operator {event.operator_id}
            {event.effective_user_id
              ? ` — Effective user ${event.effective_user_id}`
              : ''}{' '}
            — {event.target_id ?? ''} — {event.reason}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}
