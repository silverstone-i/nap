/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { addAddress, updateAddress } from '../../api/endpoints.js';
import { CountrySelect } from '../../components/CountrySelect.jsx';
import { LabelSelect } from './ContactMethodDialog.jsx';
import { describeDirectoryError } from './directoryErrors.js';

/** Blank optional text becomes null. */
const orNull = value => (value.trim() ? value.trim() : null);

/**
 * Add or edit an address (M0005-R015). The country comes from the M0004
 * country lookup; making it primary replaces the current primary address.
 * @param {{partyId: string, address: object|null, onClose: () => void, onSaved: () => void}} props
 * @returns {JSX.Element}
 */
export function AddressDialog({ partyId, address, onClose, onSaved }) {
  const [line1, setLine1] = useState(address?.line1 ?? '');
  const [line2, setLine2] = useState(address?.line2 ?? '');
  const [city, setCity] = useState(address?.city ?? '');
  const [region, setRegion] = useState(address?.region ?? '');
  const [postalCode, setPostalCode] = useState(address?.postalCode ?? '');
  const [country, setCountry] = useState(address?.country ?? null);
  const [labelId, setLabelId] = useState(address?.labelId ?? null);
  const [isPrimary, setIsPrimary] = useState(address?.isPrimary ?? false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const fields = {
      line1: line1.trim(),
      line2: orNull(line2),
      city: city.trim(),
      region: orNull(region),
      postalCode: orNull(postalCode),
      country,
      labelId,
      isPrimary,
    };
    try {
      if (address)
        await updateAddress(partyId, address.id, {
          ...fields,
          revision: address.revision,
        });
      else await addAddress(partyId, fields);
      onSaved();
    } catch (err) {
      setError(describeDirectoryError(err));
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
      aria-labelledby="address-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="address-title">
        {address ? 'Edit address' : 'Add address'}
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Address line 1"
            value={line1}
            onChange={event => setLine1(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Address line 2"
            value={line2}
            onChange={event => setLine2(event.target.value)}
            fullWidth
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
            <TextField
              label="Postal code"
              value={postalCode}
              onChange={event => setPostalCode(event.target.value)}
              fullWidth
            />
          </Stack>
          <CountrySelect value={country} onChange={setCountry} required />
          <LabelSelect
            appliesTo="address"
            value={labelId}
            onChange={setLabelId}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={isPrimary}
                onChange={event => setIsPrimary(event.target.checked)}
              />
            }
            label="Primary address"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={saving || !country}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
