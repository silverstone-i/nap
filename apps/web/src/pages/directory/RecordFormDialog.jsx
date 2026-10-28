/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { ApiError } from '../../api/client.js';
import { createDirectoryRecord } from '../../api/endpoints.js';
import { describeDirectoryError } from './directoryErrors.js';
import { DuplicateTaxIdMessage, TaxIdInput } from './directoryFields.jsx';
import { KIND_LABELS } from './directoryRecords.js';
import { defaultTaxIdFormatId, useTaxIdFormats } from './useTaxIdFormats.js';

/** M0005-R060: what a refused create means for each kind. */
const CREATE_MESSAGES = {
  vendor: { INVALID_INPUT: 'A vendor needs a tax ID.' },
  client: {
    INVALID_INPUT: 'Give the client its own tax ID or one primary buyer.',
  },
};

/**
 * Create a directory record with only the fields it cannot exist without
 * (I0001-R037, M0005-R050): an employee's name and primary email; a
 * contact's or an organization contact's name; a vendor's legal name and
 * tax ID (R006); a client's legal name and either its own tax ID or one
 * primary buyer (R007). Everything else is set from the new record's
 * detail, which the caller opens from `onSaved`.
 * @param {{collection: 'people'|'organizations'|'organization-contacts', defaults?: {kind?: string, organizationId?: string, organizationKind?: string}, canWriteTaxIds: boolean, onClose: () => void, onSaved: (saved: object) => void}} props
 * @returns {JSX.Element}
 */
export function RecordFormDialog({
  collection,
  defaults = {},
  canWriteTaxIds,
  onClose,
  onSaved,
}) {
  const people = collection === 'people';
  const organizations = collection === 'organizations';
  const contacts = collection === 'organization-contacts';
  // A new person or organization's kind comes from the page that opened it.
  const kind = defaults.kind;
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [primaryEmail, setPrimaryEmail] = useState('');
  const [legalName, setLegalName] = useState('');
  const formats = useTaxIdFormats();
  const [taxId, setTaxId] = useState('');
  const [chosenFormatId, setTaxIdFormatId] = useState(null);
  const [clientTaxSource, setClientTaxSource] = useState('buyer');
  const [buyer, setBuyer] = useState({
    firstName: '',
    lastName: '',
    taxId: '',
    taxIdFormatId: null,
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const fromBuyer =
    organizations && kind === 'client' && clientTaxSource === 'buyer';
  const ownTaxId =
    canWriteTaxIds && organizations && (kind === 'vendor' || !fromBuyer);
  const taxIdFormatId = chosenFormatId ?? defaultTaxIdFormatId(formats, true);
  const buyerFormatId =
    buyer.taxIdFormatId ?? defaultTaxIdFormatId(formats, false);

  function body() {
    if (people)
      return {
        kind,
        firstName,
        lastName,
        ...(kind === 'employee' ? { primaryEmail: primaryEmail.trim() } : {}),
      };
    if (contacts)
      return { organizationId: defaults.organizationId, firstName, lastName };
    return {
      kind,
      legalName,
      ...(ownTaxId ? { taxId: taxId.trim(), taxIdFormatId } : {}),
      ...(fromBuyer
        ? {
            contacts: [
              {
                firstName: buyer.firstName,
                lastName: buyer.lastName,
                ...(canWriteTaxIds
                  ? {
                      taxId: buyer.taxId.trim(),
                      taxIdFormatId: buyerFormatId,
                    }
                  : {}),
                isPrimaryTaxContact: true,
              },
            ],
          }
        : {}),
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      onSaved(await createDirectoryRecord(collection, body()));
    } catch (err) {
      setError(
        err instanceof ApiError &&
          err.code === 'DUPLICATE_TAX_ID' &&
          err.details?.id ? (
          <DuplicateTaxIdMessage
            kind={kind}
            holder={err.details}
            onFollow={onClose}
          />
        ) : (
          describeDirectoryError(err, CREATE_MESSAGES[kind] ?? {})
        )
      );
    } finally {
      setSaving(false);
    }
  }

  const title = contacts
    ? 'New contact'
    : `New ${KIND_LABELS[kind].toLowerCase()}`;

  return (
    <Dialog
      open
      onClose={onClose}
      component="form"
      onSubmit={handleSubmit}
      aria-labelledby="record-form-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="record-form-title">{title}</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Stack spacing={2} sx={{ mt: 1 }}>
          {people || contacts ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="First name"
                value={firstName}
                onChange={event => setFirstName(event.target.value)}
                required
                fullWidth
              />
              <TextField
                label="Last name"
                value={lastName}
                onChange={event => setLastName(event.target.value)}
                required
                fullWidth
              />
            </Stack>
          ) : null}
          {people && kind === 'employee' ? (
            <TextField
              label="Primary email"
              type="email"
              value={primaryEmail}
              onChange={event => setPrimaryEmail(event.target.value)}
              required
              fullWidth
            />
          ) : null}
          {organizations ? (
            <TextField
              label={kind === 'client' ? 'Legal name or unit' : 'Legal name'}
              value={legalName}
              onChange={event => setLegalName(event.target.value)}
              required
              fullWidth
            />
          ) : null}
          {organizations && kind === 'client' ? (
            <TextField
              select
              label="Primary tax ID"
              value={clientTaxSource}
              onChange={event => setClientTaxSource(event.target.value)}
              fullWidth
            >
              <MenuItem value="buyer">From a buyer</MenuItem>
              <MenuItem value="own">The client’s own EIN</MenuItem>
            </TextField>
          ) : null}
          {fromBuyer ? (
            <>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Buyer first name"
                  value={buyer.firstName}
                  onChange={event =>
                    setBuyer(b => ({ ...b, firstName: event.target.value }))
                  }
                  required
                  fullWidth
                />
                <TextField
                  label="Buyer last name"
                  value={buyer.lastName}
                  onChange={event =>
                    setBuyer(b => ({ ...b, lastName: event.target.value }))
                  }
                  required
                  fullWidth
                />
              </Stack>
              {canWriteTaxIds ? (
                <TaxIdInput
                  label="Buyer tax ID"
                  value={buyer.taxId}
                  onChange={value => setBuyer(b => ({ ...b, taxId: value }))}
                  formats={formats}
                  formatId={buyerFormatId}
                  onFormatChange={id =>
                    setBuyer(b => ({ ...b, taxIdFormatId: id }))
                  }
                />
              ) : null}
            </>
          ) : null}
          {ownTaxId ? (
            <TaxIdInput
              label="Tax ID"
              value={taxId}
              onChange={setTaxId}
              formats={formats}
              formatId={taxIdFormatId}
              onFormatChange={setTaxIdFormatId}
            />
          ) : null}
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
