/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import { normalizePhone } from '@nap/shared';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { CountrySelect } from '../../components/CountrySelect.jsx';
import { PasswordField } from '../../components/PasswordField.jsx';
import { ApiError } from '../../api/client.js';
import { listCellsOverview, provisionTenant } from '../../api/endpoints.js';
import { useEffectiveSettings } from '../../shell/EffectiveSettingsContext.jsx';

const CONFLICTS = {
  code: 'Another tenant uses this code.',
  email: 'This email belongs to a login that cannot be used.',
};

/** M0001-07-R002: a letter, then 1–31 letters, digits, or `_`, uppercased. */
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,31}$/;

/**
 * Map a provisioning failure to a message.
 * @param {unknown} err
 * @returns {string}
 */
function describeError(err) {
  if (!(err instanceof ApiError))
    return 'Something went wrong. Please try again.';
  if (err.code === 'INVALID_INPUT')
    return err.details?.field === 'phone'
      ? 'Enter a valid phone number for the administrator.'
      : 'Check the names, code, cell, head office, administrator, and temporary password.';
  if (err.code === 'CELL_UNAVAILABLE')
    return 'That cell, or the Napsoft cell, is not ready. Try again or pick another cell.';
  // I0006-R023: the server names the value that is taken.
  if (err.code === 'CONFLICT')
    return (
      CONFLICTS[err.details?.field] ??
      'Another change got there first. Try again.'
    );
  if (err.code === 'IDEMPOTENCY_CONFLICT')
    return 'This request was already submitted differently. Close and try again.';
  if (err.code === 'FORBIDDEN')
    return 'You are not authorized to provision a tenant.';
  return 'Something went wrong. Please try again.';
}

/** Mirrors `TIERS` (`apps/api` `domain/tenants.js`) — a display list only; the server remains the source of truth for validation. */
const TIERS = ['starter', 'growth', 'enterprise'];

/**
 * "Provision tenant" (I0013-R001, R005): name the business, pick a ready
 * cell, and name its first administrator with a temporary password.
 * Provisioning creates the Napsoft client too, with its head office as its
 * location and bill-to address (I0014-R024). The administrator holds every
 * contact designation.
 * @param {{onClose: () => void, onProvisioned: () => void}} props
 * @returns {JSX.Element}
 */
export function ProvisionTenantDialog({ onClose, onProvisioned }) {
  const [code, setCode] = useState('');
  // I0006-R022: the code's helper shows only while it is invalid.
  const codeInvalid =
    code.trim() !== '' && !CODE_PATTERN.test(code.trim().toUpperCase());
  const [legalName, setLegalName] = useState('');
  const [dbaName, setDbaName] = useState('');
  const [tier, setTier] = useState('starter');
  const [cells, setCells] = useState(null);
  const [cell, setCell] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // The phone is read in Napsoft's default country; the API assumes the US.
  const { defaultCountry } = useEffectiveSettings().settings;
  const [password, setPassword] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState(defaultCountry);
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
        legalName: legalName.trim(),
        dbaName: dbaName.trim() || null,
        code: code.trim(),
        tier,
        cell,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email,
        phone: normalizePhone(phone, defaultCountry) ?? phone,
        password,
        address: {
          line1: line1.trim(),
          line2: line2.trim() || null,
          city: city.trim(),
          region: region.trim() || null,
          postalCode: postalCode.trim() || null,
          country,
        },
      });
      onProvisioned();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const noCells = cells !== null && cells.length === 0;

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
      <DialogTitle id="provision-tenant-title">Provision tenant</DialogTitle>
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
            label="Legal name"
            value={legalName}
            onChange={event => setLegalName(event.target.value)}
            autoFocus
            required
            fullWidth
            slotProps={{ htmlInput: { maxLength: 160 } }}
          />
          <TextField
            label="DBA name"
            value={dbaName}
            onChange={event => setDbaName(event.target.value)}
            fullWidth
            slotProps={{ htmlInput: { maxLength: 160 } }}
          />
          <TextField
            label="Code"
            value={code}
            onChange={event => setCode(event.target.value)}
            error={codeInvalid}
            helperText={
              codeInvalid
                ? 'Use letters, digits, and _, starting with a letter.'
                : ''
            }
            required
            fullWidth
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
          <Typography variant="subtitle2">Head office</Typography>
          <TextField
            label="Address line 1"
            value={line1}
            onChange={event => setLine1(event.target.value)}
            required
            fullWidth
            slotProps={{ htmlInput: { maxLength: 255 } }}
          />
          <TextField
            label="Address line 2"
            value={line2}
            onChange={event => setLine2(event.target.value)}
            fullWidth
            slotProps={{ htmlInput: { maxLength: 255 } }}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="City"
              value={city}
              onChange={event => setCity(event.target.value)}
              required
              fullWidth
            />
            <TextField
              label="State or province"
              value={region}
              onChange={event => setRegion(event.target.value)}
              fullWidth
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Postal code"
              value={postalCode}
              onChange={event => setPostalCode(event.target.value)}
              fullWidth
            />
            <CountrySelect value={country} onChange={setCountry} required />
          </Stack>
          <Typography variant="subtitle2">Administrator</Typography>
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
          <TextField
            label="Administrator phone"
            type="tel"
            value={phone}
            onChange={event => setPhone(event.target.value)}
            required
            fullWidth
            slotProps={{ htmlInput: { maxLength: 32 } }}
          />
          <PasswordField
            label="Temporary password"
            value={password}
            onChange={event => setPassword(event.target.value)}
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
          disabled={submitting || !cell || !country}
        >
          Provision
        </Button>
      </DialogActions>
    </Dialog>
  );
}
