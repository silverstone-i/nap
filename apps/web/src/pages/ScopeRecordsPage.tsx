/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  Container,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { z } from 'zod';
import {
  getProjectCompanies,
  getRecords,
  saveRecord,
  scopeRecordSchema,
} from '../api/access.js';
import { useSession } from '../auth/session.js';
import { SessionStatus } from '../auth/SessionStatus.js';
/** Does: Lists and manages minimal scoped companies or projects. Called by: company/project routes. */
export function ScopeRecordsPage({ projects = false }: { projects?: boolean }) {
  const { state } = useSession();
  return (
    <ScopeRecordsEditor
      key={`${projects}:${state.status === 'ready' ? `${state.session?.actorId}:${state.session?.tenantId}` : state.status}`}
      projects={projects}
    />
  );
}
/** Does: Holds record forms within one active tenant. Called by: the keyed scope page. */
function ScopeRecordsEditor({ projects }: { projects: boolean }) {
  const { state } = useSession();
  const tenant = state.status === 'ready' ? state.session?.tenantId : null;
  const [records, setRecords] = useState<z.infer<typeof scopeRecordSchema>[]>(
    []
  );
  const [companies, setCompanies] = useState<
    z.infer<typeof scopeRecordSchema>[]
  >([]);
  const [loaded, setLoaded] = useState<string | null>();
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [next, setNext] = useState<string>();
  useEffect(() => {
    let active = true;
    void getRecords(projects, cursor).then(r => {
      if (!active) return;
      setLoaded(tenant);
      setRecords(r.ok ? r.body.data : []);
      setNext(r.ok ? r.body.page.cursor : undefined);
      setMessage(
        r.ok
          ? ''
          : r.error.code === 'FORBIDDEN'
            ? 'This module is disabled or your role does not grant access.'
            : r.error.message
      );
    });
    if (projects)
      void getProjectCompanies().then(r => {
        if (active) setCompanies(r.ok ? r.body.data : []);
      });
    return () => {
      active = false;
    };
  }, [tenant, projects, revision, cursor]);
  /** Does: Sends one record change and refreshes the page. Called by: create/edit/archive controls. */
  async function change(
    operation: 'create' | 'update' | 'archive',
    body: unknown
  ) {
    setBusy(true);
    const result = await saveRecord(projects, body, operation);
    setBusy(false);
    setMessage(result.ok ? 'Saved.' : result.error.message);
    if (result.ok) {
      setRevision(r => r + 1);
      setId('');
      setCode('');
      setName('');
    }
  }
  if (state.status !== 'ready') return <SessionStatus />;
  if (!state.session) return <Navigate to="/login" replace />;
  if (!tenant) return <Navigate to="/tenants" replace />;
  return (
    <Container maxWidth="md" component="main" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Typography component="h1" variant="h4">
          {projects ? 'Projects' : 'Companies'}
        </Typography>
        <Stack direction="row">
          <Button component={Link} to="/account">
            Account
          </Button>
          <Button component={Link} to="/access">
            Roles and access
          </Button>
          <Button component={Link} to={projects ? '/companies' : '/projects'}>
            {projects ? 'Companies' : 'Projects'}
          </Button>
        </Stack>
        {state.session.controlledAccess && (
          <Alert severity="warning">
            Controlled access: {state.session.controlledAccess.reason}. Exit
            from Account.
          </Alert>
        )}
        {message && <Alert severity="info">{message}</Alert>}
        {loaded === tenant &&
          records.map(r => (
            <Box
              key={r.id}
              sx={{ borderBottom: 1, borderColor: 'divider', pb: 2 }}
            >
              <Typography variant="h6">
                {r.code} — {r.name}
              </Typography>
              <Button
                onClick={() => {
                  setId(r.id);
                  setCode(r.code);
                  setName(r.name);
                  setCompany(r.company_id ?? '');
                }}
              >
                Edit
              </Button>
              <Button
                color="error"
                disabled={busy}
                onClick={() => void change('archive', { ids: [r.id] })}
              >
                Archive
              </Button>
            </Box>
          ))}
        <Stack direction="row">
          <Button disabled={!cursor} onClick={() => setCursor(undefined)}>
            First page
          </Button>
          <Button disabled={!next} onClick={() => setCursor(next)}>
            Next page
          </Button>
        </Stack>
        <Typography component="h2" variant="h5">
          {id ? 'Edit record' : 'Create record'}
        </Typography>
        <Box
          component="form"
          onSubmit={e => {
            e.preventDefault();
            void change(
              id ? 'update' : 'create',
              id
                ? { ids: [id], changes: { code, name } }
                : { code, name, ...(projects ? { company_id: company } : {}) }
            );
          }}
        >
          <Stack spacing={2}>
            <TextField
              label="Code"
              required
              value={code}
              onChange={e => setCode(e.target.value)}
            />
            <TextField
              label="Name"
              required
              value={name}
              onChange={e => setName(e.target.value)}
            />
            {projects && !id && (
              <TextField
                select
                label="Company"
                required
                value={company}
                onChange={e => setCompany(e.target.value)}
              >
                <MenuItem value="">Select company</MenuItem>
                {companies.map(c => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Button type="submit" variant="contained" disabled={busy}>
              {id ? 'Save changes' : 'Create'}
            </Button>
            {id && (
              <Button
                onClick={() => {
                  setId('');
                  setCode('');
                  setName('');
                }}
              >
                Cancel edit
              </Button>
            )}
          </Stack>
        </Box>
      </Stack>
    </Container>
  );
}
