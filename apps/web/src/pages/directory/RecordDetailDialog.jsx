/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCallback, useEffect, useState } from 'react';
import { formatPhone } from '@nap/shared';
import { useEffectiveSettings } from '../../shell/EffectiveSettingsContext.jsx';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import {
  archiveDirectoryRecord,
  getDirectoryRecord,
  removeAddress,
  removeContactMethod,
  restoreDirectoryRecord,
  revealTaxId,
  updateDirectoryRecord,
} from '../../api/endpoints.js';
import { ArchiveViewTabs } from '../../grid/ArchiveViewTabs.jsx';
import { ConfirmDialog } from '../../grid/ConfirmDialog.jsx';
import { ApiError } from '../../api/client.js';
import { AddressDialog } from './AddressDialog.jsx';
import { ClientTenantPanel } from './ClientTenantPanel.jsx';
import { ARCHIVE_TEXT, DirectoryGrid } from './DirectoryGrid.jsx';
import { ContactMethodDialog } from './ContactMethodDialog.jsx';
import { EditNameDialog } from './EditNameDialog.jsx';
import { PortalAccessDialog } from './PortalAccessDialog.jsx';
import { RecordFormDialog } from './RecordFormDialog.jsx';
import { TaxIdDialog } from './TaxIdDialog.jsx';
import {
  emptyListMessage,
  KIND_LABELS,
  recordName,
} from './directoryRecords.js';
import {
  describeDirectoryError,
  isStaleRevision,
  PORTAL_MESSAGES,
} from './directoryErrors.js';
import { PortalAccessPanel } from './PortalAccess.jsx';
import { useDirectoryBulk } from './useDirectoryBulk.js';
import { displayTaxId, useTaxIdFormats } from './useTaxIdFormats.js';
import { ActionBar } from '../../shell/ActionBar.jsx';
import { useNotice } from '../../shell/NoticeContext.jsx';

/**
 * A pencil that opens one section's dialog (I0001-R036, M0005-R049).
 * @param {{label: string, onClick: () => void}} props
 * @returns {JSX.Element}
 */
function SectionPencil({ label, onClick }) {
  return (
    <IconButton size="small" aria-label={label} onClick={onClick}>
      <EditIcon fontSize="small" />
    </IconButton>
  );
}

/**
 * Tax ID shown masked in its format, with a reveal button for
 * `tax-ids::read` (M0005-R012, R040) and, for `tax-ids::write`, the pencil
 * that changes it (R052). Revealing is recorded by the server.
 * @param {{collection: string, record: object, formats: object[]|null, canReveal: boolean, onEdit?: () => void}} props
 */
function TaxIdLine({ collection, record, formats, canReveal, onEdit }) {
  const [full, setFull] = useState(null);
  const [error, setError] = useState(null);
  if (!record.taxIdLast4 && !onEdit) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography variant="body2">
        Tax ID: {displayTaxId(record, formats, full) ?? 'None'}
      </Typography>
      {onEdit ? <SectionPencil label="Edit tax ID" onClick={onEdit} /> : null}
      {canReveal && record.taxIdLast4 && !full ? (
        <Button
          size="small"
          variant="text"
          onClick={async () => {
            try {
              setFull(await revealTaxId(collection, record.id));
            } catch (err) {
              setError(describeDirectoryError(err));
            }
          }}
        >
          Reveal
        </Button>
      ) : null}
      {full ? (
        <Button size="small" variant="text" onClick={() => setFull(null)}>
          Hide
        </Button>
      ) : null}
      {error ? (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      ) : null}
    </Stack>
  );
}

/**
 * A record's detail: its fields, tax ID, emails, phones, and addresses; an
 * organization's contacts; and archive and restore (M0005-R026). It is the
 * record's only edit surface: each part changes through its own pencil
 * (I0001-R036, M0005-R049).
 * @param {{collection: 'people'|'organizations'|'organization-contacts', id: string, abilities: {write: boolean, readTaxIds: boolean, writeTaxIds: boolean, assignRoles?: boolean}, onClose: () => void, onChanged: () => void}} props
 * @returns {JSX.Element}
 */
export function RecordDetailDialog({
  collection,
  id,
  abilities,
  onClose,
  onChanged,
}) {
  const [record, setRecord] = useState(null);
  const formats = useTaxIdFormats();
  const { defaultCountry } = useEffectiveSettings().settings;
  const [error, setError] = useState(null);
  // The pencil dialog open: 'name', 'taxId', or 'portal'.
  const [section, setSection] = useState(null);
  const [methodForm, setMethodForm] = useState(null);
  const [addressForm, setAddressForm] = useState(null);
  const [contactForm, setContactForm] = useState(false);
  const [openContact, setOpenContact] = useState(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  // M0005-R054: the email, phone, or address waiting on "Remove …?".
  const [confirmRemove, setConfirmRemove] = useState(null);
  const notify = useNotice();
  // I0011-R003: the contacts view lives in the dialog and opens on Active.
  const [contactsArchived, setContactsArchived] = useState(false);
  // Bumped on every change, so the contacts grid reloads its page too.
  const [contactsTick, setContactsTick] = useState(0);

  const load = useCallback(
    () =>
      getDirectoryRecord(collection, id)
        .then(setRecord)
        .catch(err => setError(describeDirectoryError(err))),
    [collection, id]
  );
  useEffect(() => {
    void load();
  }, [load]);

  const changed = () => {
    void load();
    setContactsTick(tick => tick + 1);
    onChanged();
  };

  /**
   * Fetch the record again after a form's save hit `STALE_REVISION`, so
   * the detail and the grid behind it show the change too.
   * @returns {Promise<object>}
   */
  async function reload() {
    const fresh = await getDirectoryRecord(collection, id);
    setRecord(fresh);
    setContactsTick(tick => tick + 1);
    onChanged();
    return fresh;
  }

  /**
   * One of the fresh record's emails, phones, or addresses.
   * @param {'contactMethods'|'addresses'} list
   * @param {string} itemId
   * @returns {Promise<object>}
   * @throws {ApiError} `NOT_FOUND` when it was removed meanwhile.
   */
  async function reloadItem(list, itemId) {
    const found = (await reload())[list].find(item => item.id === itemId);
    if (!found) throw new ApiError('NOT_FOUND', 404);
    return found;
  }
  // I0001-R034: the contacts grid's bulk actions sit in its own toolbar.
  const contactAbilities = {
    ...abilities,
    write: abilities.write && !record?.archived,
  };
  const contactsBulk = useDirectoryBulk({
    collection: 'organization-contacts',
    abilities: contactAbilities,
    onDone: changed,
    archived: contactsArchived,
    noun: ['contact', 'contacts'],
  });

  /**
   * Run one change, then reload and, when `done` is given, report it as a
   * notice (M0005-R055).
   */
  async function run(action, messages = {}, done) {
    setError(null);
    try {
      await action();
      if (done) notify(done);
      changed();
    } catch (err) {
      setError(describeDirectoryError(err, messages));
      if (isStaleRevision(err)) void load();
    }
  }

  function afterSection() {
    setSection(null);
    changed();
  }

  /**
   * M0005-R051: make this client contact its client's primary tax contact,
   * the same change the client's contacts grid makes.
   */
  function makePrimaryTaxContact() {
    return run(async () => {
      const client = await getDirectoryRecord(
        'organizations',
        record.organizationId
      );
      await updateDirectoryRecord('organizations', client.id, {
        primaryTaxContactId: record.id,
        revision: client.revision,
      });
    });
  }

  if (!record)
    return (
      <Dialog open onClose={onClose} aria-label="Loading record">
        <DialogContent>
          {error ? (
            <Alert severity="error">{error}</Alert>
          ) : (
            <CircularProgress aria-label="Loading record" />
          )}
        </DialogContent>
      </Dialog>
    );

  const methods = record.contactMethods.filter(m => !m.archived);
  const addresses = record.addresses.filter(a => !a.archived);
  const canEditDetails = abilities.write && !record.archived;
  const organizationContact = collection === 'organization-contacts';
  // R006–R008: a vendor contact has no tax ID, and a client whose tax ID
  // comes from a buyer has none of its own to change here.
  const canEditTaxId =
    canEditDetails &&
    abilities.writeTaxIds &&
    record.kind !== 'vendor_contact' &&
    !(record.kind === 'client' && !record.taxIdLast4);
  // I0010-R001, R013: portal access and roles need both capabilities.
  const canEditPortal = canEditDetails && Boolean(abilities.assignRoles);

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        aria-labelledby="record-detail-title"
        fullWidth
        maxWidth="md"
      >
        <DialogTitle id="record-detail-title">
          {recordName(record)}{' '}
          {canEditDetails ? (
            <SectionPencil
              label="Edit name"
              onClick={() => setSection('name')}
            />
          ) : null}
          {record.archived ? (
            <Chip size="small" label="Archived" sx={{ ml: 1 }} />
          ) : null}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {error ? (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            ) : null}
            {record.dbaName ? (
              <Typography variant="body2">
                DBA name: {record.dbaName}
              </Typography>
            ) : null}
            <TaxIdLine
              collection={collection}
              record={record}
              formats={formats}
              canReveal={abilities.readTaxIds}
              onEdit={canEditTaxId ? () => setSection('taxId') : undefined}
            />
            {record.portalAccess ? (
              <PortalAccessPanel
                collection={collection}
                record={record}
                canWrite={abilities.write}
                onChanged={changed}
                onEdit={canEditPortal ? () => setSection('portal') : undefined}
              />
            ) : null}
            {record.roles?.length ? (
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{ alignItems: 'center', flexWrap: 'wrap' }}
              >
                <Typography variant="body2">Roles:</Typography>
                {record.roles.map(role =>
                  role.held ? (
                    // M0005-R059: the held-role note is the chip's tooltip.
                    <Tooltip
                      key={role.id}
                      title="Applies when this person first signs in."
                    >
                      <Chip size="small" variant="outlined" label={role.name} />
                    </Tooltip>
                  ) : (
                    <Chip key={role.id} size="small" label={role.name} />
                  )
                )}
              </Stack>
            ) : null}
            {record.isPrimaryTaxContact ? (
              <Chip
                size="small"
                color="primary"
                label="Primary tax contact"
                sx={{ alignSelf: 'flex-start' }}
              />
            ) : record.kind === 'client_contact' &&
              record.taxIdLast4 &&
              canEditDetails ? (
              <Button
                size="small"
                onClick={makePrimaryTaxContact}
                sx={{ alignSelf: 'flex-start' }}
              >
                Make primary tax contact
              </Button>
            ) : null}
            {organizationContact ? (
              <Stack direction="row" spacing={2}>
                {[
                  ['isPrimaryContact', 'Primary contact'],
                  ['isBillingContact', 'Billing contact'],
                ].map(([field, label]) => (
                  <FormControlLabel
                    key={field}
                    label={label}
                    control={
                      <Switch
                        checked={record[field] === true}
                        disabled={!canEditDetails}
                        onChange={event =>
                          run(() =>
                            updateDirectoryRecord(collection, record.id, {
                              [field]: event.target.checked,
                              revision: record.revision,
                            })
                          )
                        }
                      />
                    }
                  />
                ))}
              </Stack>
            ) : null}
            {record.kind === 'client' ? (
              <ClientTenantPanel client={record} />
            ) : null}

            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Typography variant="subtitle1">Emails and phones</Typography>
              {canEditDetails ? (
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    onClick={() =>
                      setMethodForm({ type: 'email', method: null })
                    }
                  >
                    New email
                  </Button>
                  <Button
                    size="small"
                    onClick={() =>
                      setMethodForm({ type: 'phone', method: null })
                    }
                  >
                    New phone
                  </Button>
                </Stack>
              ) : null}
            </Stack>
            {methods.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                None.
              </Typography>
            ) : (
              <List dense aria-label="Emails and phones">
                {methods.map(method => (
                  <ListItem
                    key={method.id}
                    secondaryAction={
                      canEditDetails ? (
                        <>
                          <IconButton
                            aria-label={`Edit ${method.value}`}
                            onClick={() =>
                              setMethodForm({ type: method.type, method })
                            }
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            aria-label={`Remove ${method.value}`}
                            onClick={() =>
                              setConfirmRemove({
                                thing: method.type,
                                remove: () =>
                                  run(
                                    () =>
                                      removeContactMethod(record.id, method.id),
                                    record.isPortalUser
                                      ? PORTAL_MESSAGES.email
                                      : {}
                                  ),
                              })
                            }
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </>
                      ) : null
                    }
                  >
                    <ListItemText
                      primary={
                        method.type === 'phone'
                          ? formatPhone(method.value, defaultCountry)
                          : method.value
                      }
                      secondary={[
                        method.type === 'email' ? 'Email' : 'Phone',
                        method.labelName,
                        method.isPrimary ? 'primary' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  </ListItem>
                ))}
              </List>
            )}

            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Typography variant="subtitle1">Addresses</Typography>
              {canEditDetails ? (
                <Button
                  size="small"
                  onClick={() => setAddressForm({ address: null })}
                >
                  New address
                </Button>
              ) : null}
            </Stack>
            {addresses.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                None.
              </Typography>
            ) : (
              <List dense aria-label="Addresses">
                {addresses.map(address => (
                  <ListItem
                    key={address.id}
                    secondaryAction={
                      canEditDetails ? (
                        <>
                          <IconButton
                            aria-label={`Edit ${address.line1}`}
                            onClick={() => setAddressForm({ address })}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            aria-label={`Remove ${address.line1}`}
                            onClick={() =>
                              setConfirmRemove({
                                thing: 'address',
                                remove: () =>
                                  run(() =>
                                    removeAddress(record.id, address.id)
                                  ),
                              })
                            }
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </>
                      ) : null
                    }
                  >
                    <ListItemText
                      primary={[address.line1, address.line2]
                        .filter(Boolean)
                        .join(', ')}
                      secondary={[
                        `${[address.city, address.region, address.postalCode]
                          .filter(Boolean)
                          .join(' ')} ${address.country}`,
                        address.labelName,
                        address.isPrimary ? 'primary' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  </ListItem>
                ))}
              </List>
            )}

            {record.contacts ? (
              <>
                <Typography variant="subtitle1">
                  {record.kind === 'client'
                    ? 'Buyers and contacts'
                    : 'Contacts'}
                </Typography>
                <Stack
                  direction="row"
                  aria-label="Contacts toolbar"
                  sx={{
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    columnGap: 2,
                  }}
                >
                  <Stack sx={{ mr: 'auto' }}>
                    <ArchiveViewTabs
                      archived={contactsArchived}
                      onChange={setContactsArchived}
                    />
                  </Stack>
                  <ActionBar
                    actions={[
                      ...contactsBulk.actions,
                      canEditDetails &&
                        !contactsArchived && {
                          label: 'New contact',
                          create: true,
                          onClick: () => setContactForm(true),
                        },
                    ]}
                  />
                </Stack>
                <DirectoryGrid
                  collection="organization-contacts"
                  filters={{
                    organizationId: record.id,
                    archived: contactsArchived,
                  }}
                  ariaLabel="Contacts"
                  emptyMessage={emptyListMessage(
                    'contacts',
                    contactsArchived,
                    false
                  )}
                  abilities={contactAbilities}
                  onOpen={contact => setOpenContact(contact.id)}
                  onSelectionChange={contactsBulk.onSelectionChange}
                  onChanged={changed}
                  refreshKey={contactsTick}
                  extraActions={(contact, runAction) =>
                    record.kind === 'client' &&
                    contact.taxIdLast4 &&
                    !contact.isPrimaryTaxContact
                      ? [
                          {
                            label: 'Make primary tax contact',
                            onClick: target =>
                              runAction(() =>
                                updateDirectoryRecord(
                                  'organizations',
                                  record.id,
                                  {
                                    primaryTaxContactId: target.id,
                                    revision: record.revision,
                                  }
                                )
                              ),
                          },
                        ]
                      : []
                  }
                />
                {contactsBulk.dialogs}
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          {abilities.write ? (
            record.archived ? (
              <Button
                onClick={() =>
                  run(
                    () =>
                      restoreDirectoryRecord(
                        collection,
                        record.id,
                        record.revision
                      ),
                    {},
                    `${recordName(record)} restored.`
                  )
                }
              >
                Restore
              </Button>
            ) : (
              <Button color="warning" onClick={() => setConfirmArchive(true)}>
                Archive
              </Button>
            )
          ) : null}
          <Button variant="contained" onClick={onClose}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={confirmArchive}
        title={`Archive ${KIND_LABELS[record.kind].toLowerCase()}?`}
        description={ARCHIVE_TEXT}
        confirmLabel="Archive"
        onConfirm={() => {
          setConfirmArchive(false);
          void run(
            () =>
              archiveDirectoryRecord(collection, record.id, record.revision),
            PORTAL_MESSAGES.archive,
            `${recordName(record)} archived.`
          );
        }}
        onCancel={() => setConfirmArchive(false)}
      />
      {confirmRemove ? (
        <ConfirmDialog
          open
          title={`Remove ${confirmRemove.thing}?`}
          confirmLabel="Remove"
          onConfirm={() => {
            setConfirmRemove(null);
            void confirmRemove.remove();
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      ) : null}
      {section === 'name' ? (
        <EditNameDialog
          collection={collection}
          record={record}
          onClose={() => setSection(null)}
          onSaved={afterSection}
          onStale={() => void load()}
        />
      ) : null}
      {section === 'taxId' ? (
        <TaxIdDialog
          collection={collection}
          record={record}
          formats={formats}
          onClose={() => setSection(null)}
          onSaved={afterSection}
          onStale={() => void load()}
        />
      ) : null}
      {section === 'portal' ? (
        <PortalAccessDialog
          collection={collection}
          record={record}
          onClose={() => setSection(null)}
          onSaved={afterSection}
          onStale={() => void load()}
        />
      ) : null}
      {contactForm ? (
        <RecordFormDialog
          collection="organization-contacts"
          defaults={{
            organizationId: record.id,
            organizationKind: record.kind,
          }}
          canWriteTaxIds={abilities.writeTaxIds}
          onClose={() => setContactForm(false)}
          onSaved={saved => {
            setContactForm(false);
            notify(`${recordName(saved)} created.`);
            changed();
            // M0005-R050: a new contact opens on save.
            setOpenContact(saved.id);
          }}
        />
      ) : null}
      {methodForm ? (
        <ContactMethodDialog
          partyId={record.id}
          portalUser={record.isPortalUser === true}
          method={methodForm.method}
          type={methodForm.type}
          onClose={() => setMethodForm(null)}
          onSaved={() => {
            setMethodForm(null);
            changed();
          }}
          onReload={() => reloadItem('contactMethods', methodForm.method.id)}
        />
      ) : null}
      {addressForm ? (
        <AddressDialog
          partyId={record.id}
          address={addressForm.address}
          onClose={() => setAddressForm(null)}
          onSaved={() => {
            setAddressForm(null);
            changed();
          }}
          onReload={() => reloadItem('addresses', addressForm.address.id)}
        />
      ) : null}
      {openContact ? (
        <RecordDetailDialog
          collection="organization-contacts"
          id={openContact}
          abilities={abilities}
          onClose={() => setOpenContact(null)}
          onChanged={changed}
        />
      ) : null}
    </>
  );
}
