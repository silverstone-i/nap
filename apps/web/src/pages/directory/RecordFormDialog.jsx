/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
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
  listRoles,
  updateDirectoryRecord,
} from '../../api/endpoints.js';
import { PasswordField } from '../../components/PasswordField.jsx';
import {
  describeDirectoryError,
  isStaleRevision,
  PORTAL_MESSAGES,
} from './directoryErrors.js';
import { KIND_LABELS } from './directoryRecords.js';
import {
  defaultTaxIdFormatId,
  displayTaxId,
  useTaxIdFormats,
} from './useTaxIdFormats.js';

/**
 * A choice of the tenant's active tax ID formats (M0005-R043).
 * @param {{formats: object[]|null, value: string, onChange: (id: string) => void, label?: string, disabled?: boolean}} props
 */
function TaxIdFormatSelect({
  formats,
  value,
  onChange,
  label = 'Tax ID format',
  disabled,
}) {
  const options = (formats ?? []).filter(f => !f.archived);
  return (
    <TextField
      select
      label={label}
      value={options.some(f => f.id === value) ? value : ''}
      onChange={event => onChange(event.target.value)}
      disabled={disabled || formats === null}
      sx={{ minWidth: 160 }}
    >
      {options.map(f => (
        <MenuItem key={f.id} value={f.id}>
          {`${f.country} ${f.name}`}
        </MenuItem>
      ))}
    </TextField>
  );
}

/**
 * A tax ID input with its format (M0005-R038, R043). On edit it starts
 * empty: blank keeps the stored value, and a checkbox clears it (M0005-R012).
 * @param {{value: string, onChange: (v: string) => void, formats: object[]|null, formatId: string, onFormatChange: (id: string) => void, editing: boolean, stored: string|null, clear: boolean, onClear: (v: boolean) => void, required?: boolean}} props
 *   `stored` is how the stored tax ID displays, masked.
 */
function TaxIdInput({
  value,
  onChange,
  formats,
  formatId,
  onFormatChange,
  editing,
  stored,
  clear,
  onClear,
  required,
}) {
  const mask = formats?.find(f => f.id === formatId)?.mask;
  return (
    <Stack spacing={1}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TaxIdFormatSelect
          formats={formats}
          value={formatId}
          onChange={onFormatChange}
          disabled={clear}
        />
        <TextField
          label="Tax ID"
          value={value}
          onChange={event => onChange(event.target.value)}
          required={required && !(editing && stored)}
          disabled={clear}
          fullWidth
          autoComplete="off"
          helperText={
            editing && stored
              ? `Stored: ${stored}. Leave blank to keep it.`
              : mask
                ? `As ${mask}; separators optional.`
                : ''
          }
        />
      </Stack>
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

/**
 * The tenant's unarchived roles to choose from (I0010-R002). The server
 * still refuses a role the session cannot assign (M0003-R011).
 * @param {{value: string[], onChange: (ids: string[]) => void, current: {id: string, name: string}[]}} props
 */
function RolesSelect({ value, onChange, current }) {
  const [roles, setRoles] = useState(null);
  useEffect(() => {
    let live = true;
    listRoles()
      .then(rows => live && setRoles(rows.filter(role => !role.archived)))
      .catch(() => live && setRoles([]));
    return () => {
      live = false;
    };
  }, []);
  // A role the person already holds stays listed even if it was archived.
  const options = [
    ...(roles ?? []),
    ...current.filter(role => !(roles ?? []).some(r => r.id === role.id)),
  ];
  return (
    <Autocomplete
      multiple
      loading={roles === null}
      options={options}
      getOptionLabel={role => role.name}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      value={options.filter(role => value.includes(role.id))}
      onChange={(_event, selected) => onChange(selected.map(role => role.id))}
      renderInput={params => (
        <TextField
          {...params}
          label="Roles"
          helperText="What this person can do in the portal. At least one."
        />
      )}
    />
  );
}

/** One buyer row in a new client's contact list. */
const blankBuyer = () => ({
  firstName: '',
  lastName: '',
  taxId: '',
  taxIdFormatId: '',
});

/**
 * Create or edit a directory record (M0005-R002–R009, R016). Tax ID fields
 * appear only for a session holding `tax-ids::write`. Portal access and the
 * person's roles appear only for a session that may assign roles
 * (I0010-R001). Editing sends the record's `revision`; on `STALE_REVISION`
 * `onReload` fetches the record, and the form starts over from it.
 * @param {{collection: 'people'|'organizations'|'organization-contacts', record: object|null, defaults?: {kind?: string, organizationId?: string, organizationKind?: string}, canWriteTaxIds: boolean, canManagePortal?: boolean, onClose: () => void, onSaved: (saved: object) => void, onReload?: () => Promise<object>}} props
 * @returns {JSX.Element}
 */
export function RecordFormDialog({
  collection,
  record: initialRecord,
  defaults = {},
  canWriteTaxIds,
  canManagePortal = false,
  onClose,
  onSaved,
  onReload,
}) {
  const [record, setRecord] = useState(initialRecord);
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
  const [isPortalUser, setIsPortalUser] = useState(
    record?.isPortalUser ?? false
  );
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const currentRoles = record?.roles ?? [];
  const [roleIds, setRoleIds] = useState(() =>
    currentRoles.map(role => role.id)
  );
  const formats = useTaxIdFormats();
  const [taxId, setTaxId] = useState('');
  const [chosenFormatId, setTaxIdFormatId] = useState(null);
  const [clearTaxId, setClearTaxId] = useState(false);
  const [buyers, setBuyers] = useState([blankBuyer()]);
  const [primaryBuyer, setPrimaryBuyer] = useState(0);
  const [clientTaxSource, setClientTaxSource] = useState('buyer');
  const [isPrimaryTaxContact, setIsPrimaryTaxContact] = useState(false);
  const [isPrimaryContact, setIsPrimaryContact] = useState(
    record?.isPrimaryContact ?? false
  );
  const [isBillingContact, setIsBillingContact] = useState(
    record?.isBillingContact ?? false
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  /** Start the edit over from a freshly loaded record. */
  function resetFrom(fresh) {
    setRecord(fresh);
    setFirstName(fresh.firstName ?? '');
    setLastName(fresh.lastName ?? '');
    setLegalName(fresh.legalName ?? '');
    setDbaName(fresh.dbaName ?? '');
    setIsPortalUser(fresh.isPortalUser ?? false);
    setTemporaryPassword('');
    setRoleIds((fresh.roles ?? []).map(role => role.id));
    setTaxId('');
    setTaxIdFormatId(null);
    setClearTaxId(false);
    setIsPrimaryContact(fresh.isPrimaryContact ?? false);
    setIsBillingContact(fresh.isBillingContact ?? false);
  }

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
  // R043: until the user picks one, the record's own active format or the
  // default for its kind.
  const ownFormat = formats?.find(
    f => f.id === record?.taxIdFormatId && !f.archived
  );
  const taxIdFormatId =
    chosenFormatId ??
    ownFormat?.id ??
    defaultTaxIdFormatId(formats, organizations);
  const personFormatId = defaultTaxIdFormatId(formats, false);

  const wasPortalUser = record?.isPortalUser ?? false;
  // I0008-R001: turning access on sends a temporary password; a contact is
  // created without an email, so its access is turned on by editing (R003).
  const turningOn = isPortalUser && !wasPortalUser;
  const turningOff = !isPortalUser && wasPortalUser;
  const showPortal = canManagePortal && (people || (contacts && editing));
  const rolesChanged =
    roleIds.length !== currentRoles.length ||
    roleIds.some(id => !currentRoles.some(role => role.id === id));

  /**
   * The portal-access part of a request (I0008-R001, R004): the flag, the
   * temporary password when turning on, and the roles when turning on or
   * when they changed while access stays on (I0010-R005, R009).
   */
  function portalField() {
    if (!showPortal) return {};
    const field = turningOn
      ? { isPortalUser, temporaryPassword }
      : { isPortalUser };
    if (isPortalUser && (turningOn || rolesChanged)) field.roleIds = roleIds;
    return field;
  }

  /** The tax ID part of a request: absent, a value, or null to clear. */
  function taxIdField() {
    if (!showTaxId) return {};
    if (clearTaxId) return { taxId: null };
    return taxId.trim() ? { taxId: taxId.trim(), taxIdFormatId } : {};
  }

  function body() {
    if (people)
      return editing
        ? { firstName, lastName, ...portalField(), ...taxIdField() }
        : {
            kind,
            firstName,
            lastName,
            ...portalField(),
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
          firstName: buyer.firstName,
          lastName: buyer.lastName,
          ...(buyer.taxId.trim()
            ? {
                taxId: buyer.taxId.trim(),
                taxIdFormatId: buyer.taxIdFormatId || personFormatId,
              }
            : {}),
          isPrimaryTaxContact: index === primaryBuyer,
        })),
      };
    }
    const contact = {
      firstName,
      lastName,
      ...portalField(),
      isPrimaryContact,
      isBillingContact,
    };
    return editing
      ? { ...contact, ...taxIdField() }
      : {
          organizationId: defaults.organizationId,
          ...contact,
          ...(isClientContact && isPrimaryTaxContact
            ? { isPrimaryTaxContact: true }
            : {}),
          ...taxIdField(),
        };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    if (showPortal && isPortalUser && roleIds.length === 0) {
      setError('Choose at least one role for portal access.');
      return;
    }
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
      setError(
        describeDirectoryError(
          err,
          turningOn
            ? PORTAL_MESSAGES.turnOn
            : turningOff
              ? PORTAL_MESSAGES.turnOff
              : {}
        )
      );
      if (editing && onReload && isStaleRevision(err)) {
        try {
          resetFrom(await onReload());
        } catch (reloadErr) {
          setError(describeDirectoryError(reloadErr));
        }
      }
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
                  {['firstName', 'lastName'].map(field => (
                    <TextField
                      key={field}
                      label={
                        field === 'firstName'
                          ? 'Buyer first name'
                          : 'Buyer last name'
                      }
                      value={buyer[field]}
                      onChange={event =>
                        setBuyers(list =>
                          list.map((b, i) =>
                            i === index
                              ? { ...b, [field]: event.target.value }
                              : b
                          )
                        )
                      }
                      required
                      fullWidth
                    />
                  ))}
                  {canWriteTaxIds ? (
                    <TaxIdFormatSelect
                      formats={formats}
                      label="Format"
                      value={buyer.taxIdFormatId || personFormatId}
                      onChange={id =>
                        setBuyers(list =>
                          list.map((b, i) =>
                            i === index ? { ...b, taxIdFormatId: id } : b
                          )
                        )
                      }
                    />
                  ) : null}
                  {canWriteTaxIds ? (
                    <TextField
                      label="Buyer tax ID"
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
              value={taxId}
              onChange={setTaxId}
              formats={formats}
              formatId={taxIdFormatId}
              onFormatChange={setTaxIdFormatId}
              editing={editing}
              stored={record ? displayTaxId(record, formats) : null}
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
          {contacts ? (
            <Stack direction="row" spacing={2}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isPrimaryContact}
                    onChange={event =>
                      setIsPrimaryContact(event.target.checked)
                    }
                  />
                }
                label="Primary contact"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isBillingContact}
                    onChange={event =>
                      setIsBillingContact(event.target.checked)
                    }
                  />
                }
                label="Billing contact"
              />
            </Stack>
          ) : null}
          {showPortal ? (
            <FormControlLabel
              control={
                <Switch
                  checked={isPortalUser}
                  onChange={event => setIsPortalUser(event.target.checked)}
                />
              }
              label="Portal access"
            />
          ) : null}
          {showPortal && isPortalUser ? (
            <RolesSelect
              value={roleIds}
              onChange={setRoleIds}
              current={currentRoles}
            />
          ) : null}
          {showPortal &&
          isPortalUser &&
          currentRoles.some(role => role.held) ? (
            <Typography variant="caption" color="text.secondary">
              Applies when this person first signs in.
            </Typography>
          ) : null}
          {showPortal && turningOn ? (
            <PasswordField
              label="Temporary password"
              value={temporaryPassword}
              onChange={event => setTemporaryPassword(event.target.value)}
              helperText="Give this to the person. They must replace it when they first sign in."
              required
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
