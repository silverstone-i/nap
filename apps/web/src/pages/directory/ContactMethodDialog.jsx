/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
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
import { describeDirectoryError, PORTAL_MESSAGES } from './directoryErrors.js';

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
 * the party's current primary of that type.
 * @param {{partyId: string, method: object|null, type: 'email'|'phone', portalUser?: boolean, onClose: () => void, onSaved: () => void}} props
 * @returns {JSX.Element}
 */
export function ContactMethodDialog({
  partyId,
  method,
  type,
  portalUser = false,
  onClose,
  onSaved,
}) {
  const [value, setValue] = useState(method?.value ?? '');
  const [labelId, setLabelId] = useState(method?.labelId ?? null);
  const [isPrimary, setIsPrimary] = useState(method?.isPrimary ?? false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const noun = type === 'email' ? 'email' : 'phone';

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
        {method ? `Edit ${noun}` : `Add ${noun}`}
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label={type === 'email' ? 'Email' : 'Phone'}
            type={type === 'email' ? 'email' : 'tel'}
            value={value}
            onChange={event => setValue(event.target.value)}
            required
            fullWidth
          />
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
