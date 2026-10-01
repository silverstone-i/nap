/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { PasswordField } from '../../components/PasswordField.jsx';
import { ApiError } from '../../api/client.js';
import { listCellsOverview, provisionTenant } from '../../api/endpoints.js';

/**
 * Map a provisioning failure to a message.
 * @param {unknown} err
 * @returns {string}
 */
function describeError(err) {
  if (!(err instanceof ApiError))
    return 'Something went wrong. Please try again.';
  if (err.code === 'INVALID_INPUT')
    return 'Check the code, name, cell, administrator, and temporary password.';
  if (err.code === 'CELL_UNAVAILABLE')
    return 'That cell, or the Napsoft cell, is not ready. Try again or pick another cell.';
  if (err.code === 'NOT_FOUND')
    return 'This client no longer exists or is archived.';
  if (err.code === 'CONFLICT')
    return 'That code is taken, this client already has a tenant, or the email belongs to a login that cannot be used.';
  if (err.code === 'IDEMPOTENCY_CONFLICT')
    return 'This request was already submitted differently. Close and try again.';
  if (err.code === 'FORBIDDEN')
    return 'You are not authorized to provision a tenant.';
  return 'Something went wrong. Please try again.';
}

/** Mirrors `TIERS` (`apps/api` `domain/tenants.js`) — a display list only; the server remains the source of truth for validation. */
const TIERS = ['starter', 'growth', 'enterprise'];

/**
 * "Provision tenant" (I0006-R010): create a tenant from a Napsoft client,
 * pick a ready cell, and name its first administrator with a temporary
 * password, usually one of the client's contacts. The name becomes their
 * employee record (M0005-R021).
 * @param {{client: {id: string, legalName: string, contacts: object[]}, onClose: () => void, onProvisioned: () => void}} props
 * @returns {JSX.Element}
 */
export function ProvisionTenantDialog({ client, onClose, onProvisioned }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState(client.legalName);
  const [tier, setTier] = useState('starter');
  const [cells, setCells] = useState(null);
  const [cell, setCell] = useState('');
  const [contactId, setContactId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let live = true;
    listCellsOverview({ limit: 100 })
      .then(result => {
        if (!live) return;
        const ready = result.rows
          .filter(row => row.ready)
          .map(row => ({
            id: row.cell.id,
            label: row.cell.database_name,
          }));
        setCells(ready);
        if (ready.length === 1) setCell(ready[0].id);
      })
      .catch(() => live && setCells([]));
    return () => {
      live = false;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await provisionTenant({
        client: client.id,
        code: code.trim(),
        name: name.trim(),
        tier,
        cell,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email,
        password,
      });
      onProvisioned();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const noCells = cells !== null && cells.length === 0;
  const contacts = client.contacts.filter(c => !c.archived);

  /** Prefill the administrator from one of the client's contacts. */
  function pickContact(id) {
    setContactId(id);
    const contact = contacts.find(c => c.id === id);
    if (!contact) return;
    setFirstName(contact.firstName);
    setLastName(contact.lastName);
    setEmail(contact.primaryEmail ?? '');
  }

  return (
    <Dialog
      open
      onClose={onClose}
      component="form"
      onSubmit={handleSubmit}
      aria-labelledby="provision-tenant-title"
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id="provision-tenant-title">
        Provision tenant for {client.legalName}
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        {noCells ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No cell is ready. Provision a cell first.
          </Alert>
        ) : null}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Code"
            value={code}
            onChange={event => setCode(event.target.value)}
            helperText="Letters, digits, and _; starts with a letter."
            autoFocus
            required
            fullWidth
          />
          <TextField
            label="Name"
            value={name}
            onChange={event => setName(event.target.value)}
            required
            fullWidth
            slotProps={{ htmlInput: { maxLength: 160 } }}
          />
          <TextField
            select
            label="Tier"
            value={tier}
            onChange={event => setTier(event.target.value)}
            required
            fullWidth
          >
            {TIERS.map(option => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Cell"
            value={cell}
            onChange={event => setCell(event.target.value)}
            required
            fullWidth
            disabled={!cells?.length}
          >
            {(cells ?? []).map(option => (
              <MenuItem key={option.id} value={option.id}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          {contacts.length ? (
            <TextField
              select
              label="Administrator from contacts"
              value={contactId}
              onChange={event => pickContact(event.target.value)}
              helperText="Fills in the name and email below."
              fullWidth
            >
              {contacts.map(contact => (
                <MenuItem key={contact.id} value={contact.id}>
                  {contact.firstName} {contact.lastName}
                  {contact.primaryEmail ? ` · ${contact.primaryEmail}` : ''}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="First name"
              value={firstName}
              onChange={event => setFirstName(event.target.value)}
              required
              fullWidth
              slotProps={{ htmlInput: { maxLength: 160 } }}
            />
            <TextField
              label="Last name"
              value={lastName}
              onChange={event => setLastName(event.target.value)}
              required
              fullWidth
              slotProps={{ htmlInput: { maxLength: 160 } }}
            />
          </Stack>
          <TextField
            label="Administrator email"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            required
            fullWidth
          />
          <PasswordField
            label="Temporary password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            helperText="They must change it at first sign-in."
            required
            fullWidth
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
          disabled={submitting || !cell}
        >
          Provision
        </Button>
      </DialogActions>
    </Dialog>
  );
}
