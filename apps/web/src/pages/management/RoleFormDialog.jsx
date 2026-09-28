/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  createRole,
  getRole,
  listCapabilities,
  updateRole,
} from '../../api/endpoints.js';
import { describeRoleError, isStaleRevision } from './roleErrors.js';

const CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const ANY = '*';

/** A native select, which keeps the picker keyboard- and test-friendly. */
function PartSelect({ label, value, options, onChange }) {
  return (
    <TextField
      select
      label={label}
      value={value}
      onChange={event => onChange(event.target.value)}
      slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
      size="small"
      sx={{ minWidth: 140 }}
    >
      <option value={ANY}>* (any)</option>
      {options.map(option => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </TextField>
  );
}

/**
 * Grant picker: module, router, and action come from the catalogue
 * (`GET /capabilities`) or `*`; the tenant part is free text, defaulting
 * to the selected tenant's code (M0003-R003).
 * @param {{tenantCode: string, catalogue: Array<{module: string, router: string, action: string}>, onAdd: (pattern: string) => void}} props
 */
function GrantPicker({ tenantCode, catalogue, onAdd }) {
  const [tenant, setTenant] = useState(tenantCode);
  const [module, setModule] = useState(ANY);
  const [router, setRouter] = useState(ANY);
  const [action, setAction] = useState(ANY);

  const modules = useMemo(
    () => [...new Set(catalogue.map(entry => entry.module))],
    [catalogue]
  );
  const routers = useMemo(
    () => [
      ...new Set(
        catalogue
          .filter(entry => module === ANY || entry.module === module)
          .map(entry => entry.router)
      ),
    ],
    [catalogue, module]
  );
  const actions = useMemo(
    () => [
      ...new Set(
        catalogue
          .filter(entry => module === ANY || entry.module === module)
          .filter(entry => router === ANY || entry.router === router)
          .map(entry => entry.action)
      ),
    ],
    [catalogue, module, router]
  );

  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      <TextField
        label="Tenant"
        value={tenant}
        onChange={event => setTenant(event.target.value)}
        helperText="Tenant code or *"
        size="small"
        sx={{ width: 120 }}
      />
      <PartSelect
        label="Module"
        value={module}
        options={modules}
        onChange={value => {
          setModule(value);
          setRouter(ANY);
          setAction(ANY);
        }}
      />
      <PartSelect
        label="Router"
        value={router}
        options={routers}
        onChange={value => {
          setRouter(value);
          setAction(ANY);
        }}
      />
      <PartSelect
        label="Action"
        value={action}
        options={actions}
        onChange={setAction}
      />
      <Button
        variant="outlined"
        size="small"
        disabled={!tenant.trim()}
        onClick={() =>
          onAdd(`${tenant.trim()}::${module}::${router}::${action}`)
        }
      >
        Add grant
      </Button>
    </Stack>
  );
}

/**
 * Create or edit a custom role (M0003-R016). Editing sends the role's
 * `revision`; on `STALE_REVISION` the role is reloaded into the form.
 * `grants` replaces the full set.
 * @param {{role?: import('../../api/endpoints.js').RoleView|null, tenantCode: string, onClose: () => void, onSaved: (role: object) => void}} props
 * @returns {JSX.Element}
 */
export function RoleFormDialog({ role = null, tenantCode, onClose, onSaved }) {
  const editing = Boolean(role);
  const [current, setCurrent] = useState(role);
  const [code, setCode] = useState('');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [grants, setGrants] = useState(role?.grants ?? []);
  const [catalogue, setCatalogue] = useState([]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listCapabilities()
      .then(rows => {
        if (!cancelled) setCatalogue(rows);
      })
      .catch(err => {
        if (!cancelled) setError(describeRoleError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const codeInvalid = !editing && code !== '' && !CODE_PATTERN.test(code);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const saved = editing
        ? await updateRole(current.id, {
            name,
            description,
            grants,
            revision: current.revision,
          })
        : await createRole({
            code,
            name,
            ...(description ? { description } : {}),
            grants,
          });
      onSaved(saved);
    } catch (err) {
      setError(describeRoleError(err));
      if (editing && isStaleRevision(err)) {
        try {
          const fresh = await getRole(current.id);
          setCurrent(fresh);
          setName(fresh.name);
          setDescription(fresh.description ?? '');
          setGrants(fresh.grants);
        } catch (reloadErr) {
          setError(describeRoleError(reloadErr));
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      component="form"
      onSubmit={handleSubmit}
      aria-labelledby="role-form-title"
      fullWidth
      maxWidth="md"
    >
      <DialogTitle id="role-form-title">
        {editing ? `Edit role ${role.code}` : 'Create role'}
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Stack spacing={2} sx={{ mt: 1 }}>
          {editing ? null : (
            <TextField
              label="Code"
              value={code}
              onChange={event => setCode(event.target.value)}
              error={codeInvalid}
              helperText="Lowercase letters, digits, and underscores; starts with a letter."
              autoFocus
              required
              fullWidth
            />
          )}
          <TextField
            label="Name"
            value={name}
            onChange={event => setName(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Description"
            value={description}
            onChange={event => setDescription(event.target.value)}
            multiline
            fullWidth
          />
          <Typography variant="subtitle2">Grants</Typography>
          {grants.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No grants yet.
            </Typography>
          ) : (
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: 'wrap' }}
            >
              {grants.map(grant => (
                <Chip
                  key={grant}
                  label={grant}
                  onDelete={() =>
                    setGrants(prev => prev.filter(item => item !== grant))
                  }
                />
              ))}
            </Stack>
          )}
          <GrantPicker
            tenantCode={tenantCode}
            catalogue={catalogue}
            onAdd={pattern =>
              setGrants(prev =>
                prev.includes(pattern) ? prev : [...prev, pattern]
              )
            }
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={submitting || codeInvalid}
        >
          {editing ? 'Save role' : 'Create role'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
