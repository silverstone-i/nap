/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import { formatPhone, formatPhoneInput, normalizePhone } from '@nap/shared';
import { useEffectiveSettings } from '../../shell/EffectiveSettingsContext.jsx';
import { FormattedField } from '../../components/FormattedField.jsx';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import {
  addContactMethod,
  listContactLabels,
  updateContactMethod,
} from '../../api/endpoints.js';
import {
  describeDirectoryError,
  isStaleRevision,
  PORTAL_MESSAGES,
} from './directoryErrors.js';

/**
 * Pick one active label of a group, or none.
 * @param {{appliesTo: 'email'|'phone'|'address', value: string|null, onChange: (id: string|null) => void}} props
 * @returns {JSX.Element}
 */
export function LabelSelect({ appliesTo, value, onChange }) {
  const [labels, setLabels] = useState([]);
  useEffect(() => {
    let live = true;
    listContactLabels({ appliesTo })
      .then(rows => live && setLabels(rows))
      .catch(() => live && setLabels([]));
    return () => {
      live = false;
    };
  }, [appliesTo]);
  return (
    <TextField
      select
      label="Label"
      value={value ?? ''}
      onChange={event => onChange(event.target.value || null)}
      fullWidth
    >
      <MenuItem value="">
        <em>None</em>
      </MenuItem>
      {labels.map(label => (
        <MenuItem key={label.id} value={label.id}>
          {label.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

/**
 * Add or edit an email or phone (M0005-R014). Making it primary replaces
 * the party's current primary of that type. On `STALE_REVISION`, `onReload`
 * fetches the method, and the form starts over from it.
 * @param {{partyId: string, method: object|null, type: 'email'|'phone', portalUser?: boolean, onClose: () => void, onSaved: () => void, onReload?: () => Promise<object>}} props
 * @returns {JSX.Element}
 */
export function ContactMethodDialog({
  partyId,
  method: initialMethod,
  type,
  portalUser = false,
  onClose,
  onSaved,
  onReload,
}) {
  const [method, setMethod] = useState(initialMethod);
  // M0005-R046: phones are read and shown in the tenant's default country.
  const { defaultCountry } = useEffectiveSettings().settings;
  const shown = stored =>
    type === 'phone' && stored
      ? formatPhone(stored, defaultCountry)
      : (stored ?? '');
  const [value, setValue] = useState(shown(method?.value));
  const [touched, setTouched] = useState(false);
  const [labelId, setLabelId] = useState(method?.labelId ?? null);
  const [isPrimary, setIsPrimary] = useState(method?.isPrimary ?? false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const noun = type === 'email' ? 'email' : 'phone';
  // M0005-R033: the same rule the server applies; it still decides.
  const invalidPhone =
    type === 'phone' &&
    value.trim() !== '' &&
    normalizePhone(value, defaultCountry) === null;

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (method)
        await updateContactMethod(partyId, method.id, {
          value,
          labelId,
          isPrimary,
          revision: method.revision,
        });
      else await addContactMethod(partyId, { type, value, labelId, isPrimary });
      onSaved();
    } catch (err) {
      // I0008-R018: a portal user's primary email is locked.
      setError(
        describeDirectoryError(err, portalUser ? PORTAL_MESSAGES.email : {})
      );
      if (method && onReload && isStaleRevision(err)) {
        try {
          const fresh = await onReload();
          setMethod(fresh);
          setValue(shown(fresh.value));
          setLabelId(fresh.labelId ?? null);
          setIsPrimary(fresh.isPrimary);
        } catch (reloadErr) {
          setError(describeDirectoryError(reloadErr));
        }
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      component="form"
      onSubmit={handleSubmit}
      aria-labelledby="contact-method-title"
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id="contact-method-title">
        {method ? `Edit ${noun}` : `New ${noun}`}
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Stack spacing={2} sx={{ mt: 1 }}>
          {type === 'email' ? (
            <TextField
              label="Email"
              type="email"
              value={value}
              onChange={event => setValue(event.target.value)}
              required
              fullWidth
            />
          ) : (
            <FormattedField
              label="Phone"
              type="tel"
              value={value}
              onChange={setValue}
              format={input => formatPhoneInput(input, defaultCountry)}
              onBlur={() => setTouched(true)}
              required
              fullWidth
              error={touched && invalidPhone}
              helperText={
                touched && invalidPhone ? 'Not a valid phone number.' : ''
              }
            />
          )}
          <LabelSelect appliesTo={type} value={labelId} onChange={setLabelId} />
          <FormControlLabel
            control={
              <Checkbox
                checked={isPrimary}
                onChange={event => setIsPrimary(event.target.checked)}
              />
            }
            label={`Primary ${noun}`}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={saving}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
