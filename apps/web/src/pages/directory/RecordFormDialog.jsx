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
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  createDirectoryRecord,
  updateDirectoryRecord,
} from '../../api/endpoints.js';
import { describeDirectoryError } from './directoryErrors.js';
import { KIND_LABELS } from './directoryRecords.js';

/**
 * A tax ID input. On edit it starts empty: blank keeps the stored value,
 * and a checkbox clears it (M0005-R012).
 * @param {{label: string, value: string, onChange: (v: string) => void, editing: boolean, stored: string|null, clear: boolean, onClear: (v: boolean) => void, required?: boolean}} props
 */
function TaxIdInput({
  label,
  value,
  onChange,
  editing,
  stored,
  clear,
  onClear,
  required,
}) {
  return (
    <Stack spacing={1}>
      <TextField
        label={label}
        value={value}
        onChange={event => onChange(event.target.value)}
        required={required && !(editing && stored)}
        disabled={clear}
        fullWidth
        autoComplete="off"
        helperText={
          editing && stored
            ? `Stored: •••••${stored}. Leave blank to keep it.`
            : 'Nine digits; dashes optional.'
        }
      />
      {editing && stored && !required ? (
        <FormControlLabel
          control={
            <Checkbox
              checked={clear}
              onChange={event => onClear(event.target.checked)}
            />
          }
          label="Clear tax ID"
        />
      ) : null}
    </Stack>
  );
}

/** One buyer row in a new client's contact list. */
const blankBuyer = () => ({ fullName: '', taxId: '' });

/**
 * Create or edit a directory record (M0005-R002–R009, R016). Tax ID fields
 * appear only for a session holding `tax-ids::write`.
 * @param {{collection: 'people'|'organizations'|'organization-contacts', record: object|null, defaults?: {kind?: string, organizationId?: string, organizationKind?: string}, canWriteTaxIds: boolean, onClose: () => void, onSaved: (saved: object) => void}} props
 * @returns {JSX.Element}
 */
export function RecordFormDialog({
  collection,
  record,
  defaults = {},
  canWriteTaxIds,
  onClose,
  onSaved,
}) {
  const editing = Boolean(record);
  const people = collection === 'people';
  const organizations = collection === 'organizations';
  const contacts = collection === 'organization-contacts';
  // A new person or organization's kind comes from the page that opened it.
  const kind = record?.kind ?? defaults.kind;
  const [firstName, setFirstName] = useState(record?.firstName ?? '');
  const [lastName, setLastName] = useState(record?.lastName ?? '');
  const [primaryEmail, setPrimaryEmail] = useState('');
  const [legalName, setLegalName] = useState(record?.legalName ?? '');
  const [dbaName, setDbaName] = useState(record?.dbaName ?? '');
  const [fullName, setFullName] = useState(record?.fullName ?? '');
  const [isPortalUser, setIsPortalUser] = useState(
    record?.isPortalUser ?? false
  );
  const [taxId, setTaxId] = useState('');
  const [clearTaxId, setClearTaxId] = useState(false);
  const [buyers, setBuyers] = useState([blankBuyer()]);
  const [primaryBuyer, setPrimaryBuyer] = useState(0);
  const [clientTaxSource, setClientTaxSource] = useState('buyer');
  const [isPrimaryTaxContact, setIsPrimaryTaxContact] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const contactKind =
    record?.kind ??
    (defaults.organizationKind ? `${defaults.organizationKind}_contact` : null);
  // M0005-R008: only a client contact carries a tax ID.
  const isClientContact = contacts && contactKind === 'client_contact';
  const newClientWithBuyers =
    organizations &&
    !editing &&
    kind === 'client' &&
    clientTaxSource === 'buyer';
  const showTaxId =
    canWriteTaxIds &&
    (people || (organizations && !newClientWithBuyers) || isClientContact);

  /** The tax ID part of a request: absent, a value, or null to clear. */
  function taxIdField() {
    if (!showTaxId) return {};
    if (clearTaxId) return { taxId: null };
    return taxId.trim() ? { taxId: taxId.trim() } : {};
  }

  function body() {
    if (people)
      return editing
        ? { firstName, lastName, isPortalUser, ...taxIdField() }
        : {
            kind,
            firstName,
            lastName,
            isPortalUser,
            ...(primaryEmail.trim()
              ? { primaryEmail: primaryEmail.trim() }
              : {}),
            ...taxIdField(),
          };
    if (organizations) {
      const common = {
        legalName,
        dbaName: dbaName.trim() ? dbaName.trim() : null,
        ...taxIdField(),
      };
      if (editing) return common;
      if (!newClientWithBuyers) return { kind, ...common };
      return {
        kind,
        ...common,
        contacts: buyers.map((buyer, index) => ({
          fullName: buyer.fullName,
          ...(buyer.taxId.trim() ? { taxId: buyer.taxId.trim() } : {}),
          isPrimaryTaxContact: index === primaryBuyer,
        })),
      };
    }
    return editing
      ? { fullName, isPortalUser, ...taxIdField() }
      : {
          organizationId: defaults.organizationId,
          fullName,
          isPortalUser,
          ...(isClientContact && isPrimaryTaxContact
            ? { isPrimaryTaxContact: true }
            : {}),
          ...taxIdField(),
        };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const saved = editing
        ? await updateDirectoryRecord(collection, record.id, {
            ...body(),
            revision: record.revision,
          })
        : await createDirectoryRecord(collection, body());
      onSaved(saved);
    } catch (err) {
      setError(describeDirectoryError(err));
    } finally {
      setSaving(false);
    }
  }

  const title = editing
    ? `Edit ${KIND_LABELS[record.kind].toLowerCase()}`
    : contacts
      ? 'Add contact'
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
          {people ? (
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
          {people && !editing ? (
            <TextField
              label="Primary email"
              type="email"
              value={primaryEmail}
              onChange={event => setPrimaryEmail(event.target.value)}
              required={kind === 'employee'}
              helperText={
                kind === 'employee' ? 'An employee needs a primary email.' : ''
              }
              fullWidth
            />
          ) : null}
          {organizations ? (
            <>
              <TextField
                label={kind === 'client' ? 'Legal name or unit' : 'Legal name'}
                value={legalName}
                onChange={event => setLegalName(event.target.value)}
                required
                fullWidth
              />
              <TextField
                label="Doing business as"
                value={dbaName}
                onChange={event => setDbaName(event.target.value)}
                fullWidth
              />
            </>
          ) : null}
          {contacts ? (
            <TextField
              label="Full name"
              value={fullName}
              onChange={event => setFullName(event.target.value)}
              required
              fullWidth
            />
          ) : null}
          {organizations && !editing && kind === 'client' ? (
            <TextField
              select
              label="Primary tax ID"
              value={clientTaxSource}
              onChange={event => setClientTaxSource(event.target.value)}
              fullWidth
              helperText="A home buyer client takes its primary tax ID from one buyer."
            >
              <MenuItem value="buyer">From a buyer</MenuItem>
              <MenuItem value="own">The client’s own EIN</MenuItem>
            </TextField>
          ) : null}
          {newClientWithBuyers ? (
            <Stack spacing={1}>
              <Typography variant="subtitle2">Buyers</Typography>
              {buyers.map((buyer, index) => (
                <Stack
                  key={index}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  sx={{ alignItems: { sm: 'center' } }}
                >
                  <TextField
                    label="Buyer name"
                    value={buyer.fullName}
                    onChange={event =>
                      setBuyers(list =>
                        list.map((b, i) =>
                          i === index
                            ? { ...b, fullName: event.target.value }
                            : b
                        )
                      )
                    }
                    required
                    fullWidth
                  />
                  {canWriteTaxIds ? (
                    <TextField
                      label="Buyer SSN"
                      value={buyer.taxId}
                      onChange={event =>
                        setBuyers(list =>
                          list.map((b, i) =>
                            i === index
                              ? { ...b, taxId: event.target.value }
                              : b
                          )
                        )
                      }
                      required={index === primaryBuyer}
                      autoComplete="off"
                      fullWidth
                    />
                  ) : null}
                  <FormControlLabel
                    control={
                      <Radio
                        checked={index === primaryBuyer}
                        onChange={() => setPrimaryBuyer(index)}
                      />
                    }
                    label="Primary"
                  />
                  <IconButton
                    aria-label="Remove buyer"
                    disabled={buyers.length === 1}
                    onClick={() => {
                      setBuyers(list => list.filter((_, i) => i !== index));
                      setPrimaryBuyer(0);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button
                variant="text"
                size="small"
                onClick={() => setBuyers(list => [...list, blankBuyer()])}
                sx={{ alignSelf: 'flex-start' }}
              >
                Add buyer
              </Button>
            </Stack>
          ) : null}
          {showTaxId ? (
            <TaxIdInput
              label={people || isClientContact ? 'SSN' : 'EIN'}
              value={taxId}
              onChange={setTaxId}
              editing={editing}
              stored={record?.taxIdLast4 ?? null}
              clear={clearTaxId}
              onClear={setClearTaxId}
              required={organizations && kind === 'vendor'}
            />
          ) : null}
          {contacts && !editing && isClientContact ? (
            <FormControlLabel
              control={
                <Checkbox
                  checked={isPrimaryTaxContact}
                  onChange={event =>
                    setIsPrimaryTaxContact(event.target.checked)
                  }
                />
              }
              label="Primary tax contact"
            />
          ) : null}
          {people || contacts ? (
            <FormControlLabel
              control={
                <Switch
                  checked={isPortalUser}
                  onChange={event => setIsPortalUser(event.target.checked)}
                />
              }
              label="Portal user"
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
