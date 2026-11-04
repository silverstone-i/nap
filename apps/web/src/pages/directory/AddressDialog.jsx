/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useRef, useState } from 'react';
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
import Typography from '@mui/material/Typography';
import {
  addAddress,
  findDetailMatches,
  updateAddress,
} from '../../api/endpoints.js';
import { CountrySelect } from '../../components/CountrySelect.jsx';
import { useEffectiveSettings } from '../../shell/EffectiveSettingsContext.jsx';
import { LabelSelect } from './ContactMethodDialog.jsx';
import { DELIVERY_LABELS, PURPOSE_LABELS } from './contactRoleText.js';
import { describeDirectoryError, isStaleRevision } from './directoryErrors.js';
import { DetailMatchesWarning } from './DetailMatchesWarning.jsx';

/** Blank optional text becomes null. */
const orNull = value => (value.trim() ? value.trim() : null);

/**
 * The purposes an organization of `kind` may give an address: remit-to is
 * for vendors only (I0014-R015).
 * @param {string|undefined} kind
 * @returns {string[]}
 */
function purposesFor(kind) {
  if (kind === 'vendor') return ['location', 'bill_to', 'remit_to'];
  if (kind === 'client') return ['location', 'bill_to'];
  return [];
}

/**
 * Form state for an address's purposes, keyed by purpose.
 * @param {object|null} address
 * @returns {Record<string, {on: boolean, isDefault: boolean, wasDefault: boolean, deliveryMethod: string}>}
 */
function purposeState(address) {
  const state = {};
  for (const purpose of Object.keys(PURPOSE_LABELS)) {
    const held = address?.purposes?.find(p => p.purpose === purpose);
    state[purpose] = {
      on: Boolean(held),
      isDefault: held?.isDefault ?? false,
      wasDefault: held?.isDefault ?? false,
      deliveryMethod: held?.deliveryMethod ?? 'email',
    };
  }
  return state;
}

/**
 * Add or edit an address (M0005-R015). The country comes from the M0004
 * country lookup; making it primary replaces the current primary address.
 * A vendor's or client's address also takes purposes, a default per
 * purpose, and a bill-to delivery method (I0014-R015–R017). A default is
 * changed by making another address the default.
 * On `STALE_REVISION`, `onReload` fetches the address, and the form starts
 * over from it.
 * @param {{partyId: string, kind?: string, address: object|null, onClose: () => void, onSaved: () => void, onReload?: () => Promise<object>}} props
 * @returns {JSX.Element}
 */
export function AddressDialog({
  partyId,
  kind,
  address: initialAddress,
  onClose,
  onSaved,
  onReload,
}) {
  const [address, setAddress] = useState(initialAddress);
  const [line1, setLine1] = useState(address?.line1 ?? '');
  const [line2, setLine2] = useState(address?.line2 ?? '');
  const [city, setCity] = useState(address?.city ?? '');
  const [region, setRegion] = useState(address?.region ?? '');
  const [postalCode, setPostalCode] = useState(address?.postalCode ?? '');
  // M0005-R058: a new address starts in the tenant's default country.
  const { defaultCountry } = useEffectiveSettings().settings;
  const [country, setCountry] = useState(address?.country ?? defaultCountry);
  const [labelId, setLabelId] = useState(address?.labelId ?? null);
  const [isPrimary, setIsPrimary] = useState(address?.isPrimary ?? false);
  const allowed = purposesFor(kind);
  const [purposes, setPurposes] = useState(() => purposeState(address));
  const setPurpose = (purpose, change) =>
    setPurposes(current => ({
      ...current,
      [purpose]: { ...current[purpose], ...change },
    }));
  const [error, setError] = useState(null);
  // M0005-R065: other records holding this address, once Save has looked.
  const [matches, setMatches] = useState(null);
  const [saving, setSaving] = useState(false);
  // Counts field changes, so a lookup answer for an older value is dropped.
  const edits = useRef(0);
  /** Set a field; a change hides the matches warning (R067). */
  const edit = setter => next => {
    edits.current += 1;
    setMatches(null);
    setter(next);
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const place = {
      line1: line1.trim(),
      line2: orNull(line2),
      city: city.trim(),
      region: orNull(region),
      postalCode: orNull(postalCode),
      country,
    };
    const fields = { ...place, labelId, isPrimary };
    if (allowed.length)
      fields.purposes = allowed
        .filter(purpose => purposes[purpose].on)
        .map(purpose => ({
          purpose,
          isDefault: purposes[purpose].isDefault,
          ...(purpose === 'bill_to'
            ? { deliveryMethod: purposes[purpose].deliveryMethod }
            : {}),
        }));
    try {
      // M0005-R065, R067: warn once about other records holding the
      // address; a lookup failure skips the warning and the save reports
      // its own.
      const moved =
        !address ||
        Object.entries(place).some(
          ([field, value]) => value !== (address[field] ?? null)
        );
      if (!matches && moved) {
        const asked = edits.current;
        const found = await findDetailMatches(partyId, {
          type: 'address',
          ...place,
        }).then(
          result => result.matches,
          () => []
        );
        // A field changed while the lookup ran: Save checks again.
        if (edits.current !== asked) return;
        if (found.length > 0) {
          setMatches(found);
          return;
        }
      }
      if (address)
        await updateAddress(partyId, address.id, {
          ...fields,
          revision: address.revision,
        });
      else await addAddress(partyId, fields);
      onSaved();
    } catch (err) {
      setError(
        describeDirectoryError(err, {
          // M0005-R064.
          DUPLICATE_DETAIL: 'This record already has this address.',
          // I0014-R010, R018, R020.
          CONTACT_DETAILS_REQUIRED:
            'A billing contact cannot receive invoices this way. Give them an email or portal access first.',
          ADDRESS_IN_USE:
            'A billing contact is limited to this bill-to address. Change their roles first.',
          LAST_LOCATION: 'A Napsoft client needs a location.',
        })
      );
      if (address && onReload && isStaleRevision(err)) {
        try {
          const fresh = await onReload();
          setAddress(fresh);
          setLine1(fresh.line1);
          setLine2(fresh.line2 ?? '');
          setCity(fresh.city);
          setRegion(fresh.region ?? '');
          setPostalCode(fresh.postalCode ?? '');
          setCountry(fresh.country);
          setLabelId(fresh.labelId ?? null);
          setIsPrimary(fresh.isPrimary);
          setPurposes(purposeState(fresh));
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
      aria-labelledby="address-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="address-title">
        {address ? 'Edit address' : 'New address'}
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        {matches ? (
          <DetailMatchesWarning matches={matches} onFollow={onClose} />
        ) : null}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Address line 1"
            value={line1}
            onChange={event => edit(setLine1)(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Address line 2"
            value={line2}
            onChange={event => edit(setLine2)(event.target.value)}
            fullWidth
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="City"
              value={city}
              onChange={event => edit(setCity)(event.target.value)}
              required
              fullWidth
            />
            <TextField
              label="State or province"
              value={region}
              onChange={event => edit(setRegion)(event.target.value)}
              fullWidth
            />
            <TextField
              label="Postal code"
              value={postalCode}
              onChange={event => edit(setPostalCode)(event.target.value)}
              fullWidth
            />
          </Stack>
          <CountrySelect value={country} onChange={edit(setCountry)} required />
          <LabelSelect
            appliesTo="address"
            value={labelId}
            onChange={edit(setLabelId)}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={isPrimary}
                onChange={event => edit(setIsPrimary)(event.target.checked)}
              />
            }
            label="Primary address"
          />
          {allowed.length ? (
            <Stack spacing={1} role="group" aria-label="Purposes">
              <Typography variant="subtitle2">Purposes</Typography>
              {allowed.map(purpose => {
                const state = purposes[purpose];
                return (
                  <Stack
                    key={purpose}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                    sx={{ alignItems: { sm: 'center' } }}
                  >
                    <FormControlLabel
                      sx={{ minWidth: 140 }}
                      control={
                        <Checkbox
                          checked={state.on}
                          onChange={event =>
                            setPurpose(purpose, { on: event.target.checked })
                          }
                        />
                      }
                      label={PURPOSE_LABELS[purpose]}
                    />
                    {state.on ? (
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={state.isDefault}
                            disabled={state.wasDefault}
                            onChange={event =>
                              setPurpose(purpose, {
                                isDefault: event.target.checked,
                              })
                            }
                          />
                        }
                        label="Default"
                      />
                    ) : null}
                    {state.on && purpose === 'bill_to' ? (
                      <TextField
                        select
                        size="small"
                        label="Delivery"
                        value={state.deliveryMethod}
                        onChange={event =>
                          setPurpose(purpose, {
                            deliveryMethod: event.target.value,
                          })
                        }
                        sx={{ minWidth: 140 }}
                      >
                        {Object.entries(DELIVERY_LABELS).map(
                          ([value, label]) => (
                            <MenuItem key={value} value={value}>
                              {label}
                            </MenuItem>
                          )
                        )}
                      </TextField>
                    ) : null}
                  </Stack>
                );
              })}
            </Stack>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={saving || !country}>
          {matches ? 'Save anyway' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
