/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import type { z } from 'zod';
import type { identityResponseSchema } from '@nap/shared';
import { getEmployee } from '../api/shell.js';
import { useSession } from '../auth/session.js';
import { useShell } from '../shell/scope.js';
/**
 * Does: Displays the employee identity permitted by the current session.
 * Called by: Accounting Directories.
 */
export function EmployeesPage() {
  const scope = useShell();
  const { state } = useSession();
  const controlled =
    state.status === 'ready' &&
    state.session?.controlledAccess?.mode === 'access';
  const [record, setRecord] = useState<
    z.infer<typeof identityResponseSchema>['data'] | null
  >(null);
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (
      !scope.employees ||
      (controlled && !scope.record) ||
      (!controlled && !!scope.record)
    )
      return;
    let active = true;
    void getEmployee(controlled ? scope.record : undefined).then(result => {
      if (!active) return;
      if (result.ok) setRecord(result.body.data);
      else
        setMessage(
          result.error.code === 'NOT_FOUND'
            ? 'Employee unavailable.'
            : result.error.message
        );
    });
    return () => {
      active = false;
    };
  }, [controlled, scope.record, scope.employees, revision]);
  return (
    <Stack spacing={2}>
      <Tabs value="employees" aria-label="Directories">
        <Tab
          component={Link}
          to={`/app/${scope.tenant}/accounting/directories?tab=employees${scope.record ? `&record=${scope.record}` : ''}`}
          value="employees"
          label="Employees"
        />
      </Tabs>
      {!controlled && scope.record ? (
        <Alert severity="warning">Employee unavailable.</Alert>
      ) : controlled && !scope.record ? (
        <Alert severity="info">
          Open an employee from Tenant Management using explicit controlled
          access.
        </Alert>
      ) : message ? (
        <Alert severity="warning">
          {message}
          <Button
            onClick={() => {
              setMessage('');
              setRecord(null);
              setRevision(v => v + 1);
            }}
          >
            Retry
          </Button>
        </Alert>
      ) : record ? (
        <Stack component="dl" spacing={1}>
          <Typography component="dt">Name</Typography>
          <Typography component="dd">{record.name}</Typography>
          <Typography component="dt">Email</Typography>
          <Typography component="dd">{record.email}</Typography>
          <Typography component="dt">Code</Typography>
          <Typography component="dd">{record.code}</Typography>
        </Stack>
      ) : (
        <Typography role="status">Loading employee…</Typography>
      )}
    </Stack>
  );
}
