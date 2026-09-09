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
  Checkbox,
  Container,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { platformAccessSchema, platformPermissions } from '@nap/shared';
import type { z } from 'zod';
import {
  getPlatformAccess,
  savePlatformAccess,
  saveEntitlement,
} from '../api/access.js';
import { overview } from '../api/control.js';
import { useSession } from '../auth/session.js';
import { SessionStatus } from '../auth/SessionStatus.js';
/** Does: Manages platform roles, shared support permissions and module grants. Called by: operator access route. */
export function PlatformAccessPage() {
  const { state } = useSession();
  const [data, setData] =
    useState<z.infer<typeof platformAccessSchema>['data']>();
  const [tenants, setTenants] = useState<{ id: string; company: string }[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [support, setSupport] = useState<string[]>([]);
  const [user, setUser] = useState('');
  const [role, setRole] = useState<'platform_admin' | 'support'>('support');
  const [tenant, setTenant] = useState('');
  const [enabled, setEnabled] = useState(false);
  const permissions =
    state.status === 'ready' ? (state.session?.platformPermissions ?? []) : [];
  const allowed = permissions.includes(
    'admin-tenancy::control::access-overview'
  );
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    void getPlatformAccess().then(r => {
      if (active) {
        setData(r.ok ? r.body.data : undefined);
        if (r.ok) setSupport(r.body.data.support);
        else setMessage(r.error.message);
      }
    });
    void overview().then(r => {
      if (active && r.ok) {
        setTenants(r.body.data.tenants);
        setPeople([...new Set(r.body.data.members.map(m => m.portal_user_id))]);
      }
    });
    return () => {
      active = false;
    };
  }, [allowed, revision]);
  /** Does: Applies a central access change. Called by: platform administration buttons. */
  async function save(body: Parameters<typeof savePlatformAccess>[0]) {
    setBusy(true);
    const result = await savePlatformAccess(body);
    setBusy(false);
    setMessage(result.ok ? 'Saved.' : result.error.message);
    if (result.ok) setRevision(r => r + 1);
  }
  if (state.status !== 'ready') return <SessionStatus />;
  if (!state.session) return <Navigate to="/login" replace />;
  return (
    <Container maxWidth="md" component="main" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Typography component="h1" variant="h4">
          Platform access
        </Typography>
        <Button component={Link} to="/control">
          Platform control
        </Button>
        {message && <Alert severity="info">{message}</Alert>}
        {!allowed ? (
          <Alert severity="warning">
            Platform access is not available for this session.
          </Alert>
        ) : (
          data && (
            <>
              {permissions.includes('admin-tenancy::control::grants') && (
                <>
                  <Typography component="h2" variant="h5">
                    Assign platform role
                  </Typography>
                  <TextField
                    select
                    label="User"
                    value={user}
                    onChange={e => setUser(e.target.value)}
                  >
                    <MenuItem value="">Select user</MenuItem>
                    {people.map(id => (
                      <MenuItem key={id} value={id}>
                        {id}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="User identifier"
                    value={user}
                    onChange={e => setUser(e.target.value)}
                    helperText="Use an existing operator identifier if the user has no tenant membership."
                  />
                  <TextField
                    select
                    label="Role"
                    value={role}
                    onChange={e => setRole(e.target.value as typeof role)}
                  >
                    <MenuItem value="platform_admin">
                      Platform administrator
                    </MenuItem>
                    <MenuItem value="support">Support</MenuItem>
                  </TextField>
                  <Button
                    disabled={busy || !user}
                    variant="contained"
                    onClick={() =>
                      void save({
                        operation: 'platform-role',
                        user,
                        role,
                        enabled: true,
                      })
                    }
                  >
                    Assign platform role
                  </Button>
                  {data.roles.map(r => (
                    <Box key={r.id}>
                      <Typography>
                        {r.portal_user_id} — {r.role}
                      </Typography>
                      <Button
                        disabled={busy}
                        color="error"
                        onClick={() =>
                          void save({
                            operation: 'platform-role',
                            user: r.portal_user_id,
                            role: r.role as typeof role,
                            enabled: false,
                          })
                        }
                      >
                        Revoke role
                      </Button>
                    </Box>
                  ))}
                  <Typography component="h2" variant="h5">
                    Shared support privileges
                  </Typography>
                  <Alert severity="info">
                    Changes apply to every support user. Tenant access is
                    disabled unless explicitly granted here.
                  </Alert>
                  <Box>
                    {platformPermissions
                      .filter(
                        p =>
                          !p.endsWith('::grants') &&
                          !p.endsWith('::role-policy')
                      )
                      .map(p => (
                        <FormControlLabel
                          key={p}
                          label={p.split('::').at(-1)}
                          control={
                            <Checkbox
                              checked={support.includes(p)}
                              onChange={(_, checked) =>
                                setSupport(old =>
                                  checked
                                    ? [...old, p]
                                    : old.filter(c => c !== p)
                                )
                              }
                            />
                          }
                        />
                      ))}
                  </Box>
                  <Button
                    disabled={busy}
                    variant="contained"
                    onClick={() =>
                      void save({
                        operation: 'support-policy',
                        permissions: support,
                      })
                    }
                  >
                    Save support privileges
                  </Button>
                </>
              )}
              <Typography component="h2" variant="h5">
                Module entitlements
              </Typography>
              <Typography>
                Core is always available. Projects requires an explicit
                entitlement.
              </Typography>
              {data.entitlements.map(e => (
                <Typography key={e.tenant_id}>
                  {tenants.find(t => t.id === e.tenant_id)?.company ??
                    e.tenant_id}
                  : Projects {e.enabled ? 'enabled' : 'disabled'} (revision{' '}
                  {e.revision})
                </Typography>
              ))}
              {permissions.includes('admin-tenancy::control::entitlement') && (
                <>
                  <TextField
                    select
                    label="Tenant"
                    value={tenant}
                    onChange={e => {
                      setTenant(e.target.value);
                      setEnabled(
                        data.entitlements.some(
                          grant =>
                            grant.tenant_id === e.target.value &&
                            grant.module === 'projects' &&
                            grant.enabled
                        )
                      );
                    }}
                  >
                    <MenuItem value="">Select tenant</MenuItem>
                    {tenants.map(t => (
                      <MenuItem key={t.id} value={t.id}>
                        {t.company}
                      </MenuItem>
                    ))}
                  </TextField>
                  <FormControlLabel
                    label="Enable Projects"
                    control={
                      <Checkbox
                        checked={enabled}
                        onChange={(_, checked) => setEnabled(checked)}
                      />
                    }
                  />
                  <Button
                    disabled={busy || !tenant}
                    variant="contained"
                    onClick={() => {
                      void (async () => {
                        setBusy(true);
                        const result = await saveEntitlement({
                          tenant,
                          module: 'projects',
                          enabled,
                        });
                        setBusy(false);
                        setMessage(
                          result.ok
                            ? result.body.data.projected
                              ? 'Entitlement synchronized.'
                              : 'Central state saved; retry to synchronize the cell.'
                            : result.error.message
                        );
                        if (result.ok) setRevision(r => r + 1);
                      })();
                    }}
                  >
                    Save or retry entitlement
                  </Button>
                </>
              )}
            </>
          )
        )}
      </Stack>
    </Container>
  );
}
