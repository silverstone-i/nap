/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
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
import { ConfirmDialog } from '../../grid/ConfirmDialog.jsx';
import { AddressDialog } from './AddressDialog.jsx';
import { ClientTenantPanel } from './ClientTenantPanel.jsx';
import { ContactMethodDialog } from './ContactMethodDialog.jsx';
import { RecordFormDialog } from './RecordFormDialog.jsx';
import { KIND_LABELS, recordName } from './directoryRecords.js';
import {
  describeDirectoryError,
  isStaleRevision,
  PORTAL_MESSAGES,
} from './directoryErrors.js';
import { PortalAccessPanel } from './PortalAccess.jsx';

/**
 * A contact value followed by its label, such as `a@b.com (Work)`.
 * @param {string|null} value
 * @param {string|null|undefined} label
 * @returns {string|null}
 */
function withLabel(value, label) {
  if (!value) return null;
  return label ? `${value} (${label})` : value;
}

/**
 * Tax ID shown masked, with a reveal button for `tax-ids::read`. Revealing
 * is recorded by the server (M0005-R012).
 * @param {{collection: string, record: object, canReveal: boolean}} props
 */
function TaxIdLine({ collection, record, canReveal }) {
  const [full, setFull] = useState(null);
  const [error, setError] = useState(null);
  if (!record.taxIdLast4) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography variant="body2">
        Tax ID: {full ?? `•••••${record.taxIdLast4}`}
      </Typography>
      {canReveal && !full ? (
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
 * organization's contacts; and edit, archive, and restore (M0005-R026).
 * @param {{collection: 'people'|'organizations'|'organization-contacts', id: string, abilities: {write: boolean, readTaxIds: boolean, writeTaxIds: boolean}, onClose: () => void, onChanged: () => void}} props
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
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(false);
  const [methodForm, setMethodForm] = useState(null);
  const [addressForm, setAddressForm] = useState(null);
  const [contactForm, setContactForm] = useState(false);
  const [openContact, setOpenContact] = useState(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

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
    onChanged();
  };

  async function run(action, messages = {}) {
    setError(null);
    try {
      await action();
      changed();
    } catch (err) {
      setError(describeDirectoryError(err, messages));
      if (isStaleRevision(err)) void load();
    }
  }

  function afterSave(saved) {
    setEditing(false);
    setContactForm(false);
    setNotice(
      saved?.duplicateTaxIds?.length
        ? `Saved. ${saved.duplicateTaxIds.length} other record(s) have the same tax ID.`
        : null
    );
    changed();
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
          <Chip size="small" label={KIND_LABELS[record.kind]} />
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
            {notice ? (
              <Alert severity="warning" onClose={() => setNotice(null)}>
                {notice}
              </Alert>
            ) : null}
            {record.dbaName ? (
              <Typography variant="body2">DBA: {record.dbaName}</Typography>
            ) : null}
            <TaxIdLine
              collection={collection}
              record={record}
              canReveal={abilities.readTaxIds}
            />
            {record.portalAccess ? (
              <PortalAccessPanel
                collection={collection}
                record={record}
                canWrite={abilities.write}
                onChanged={changed}
              />
            ) : null}
            {record.isPrimaryTaxContact ? (
              <Chip
                size="small"
                color="primary"
                label="Primary tax contact"
                sx={{ alignSelf: 'flex-start' }}
              />
            ) : null}
            {record.kind === 'client' ? (
              <ClientTenantPanel client={record} />
            ) : null}

            <Divider />
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
                    Add email
                  </Button>
                  <Button
                    size="small"
                    onClick={() =>
                      setMethodForm({ type: 'phone', method: null })
                    }
                  >
                    Add phone
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
                              run(
                                () => removeContactMethod(record.id, method.id),
                                record.isPortalUser ? PORTAL_MESSAGES.email : {}
                              )
                            }
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </>
                      ) : null
                    }
                  >
                    <ListItemText
                      primary={method.value}
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

            <Divider />
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Typography variant="subtitle1">Addresses</Typography>
              {canEditDetails ? (
                <Button
                  size="small"
                  onClick={() => setAddressForm({ address: null })}
                >
                  Add address
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
                              run(() => removeAddress(record.id, address.id))
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
                <Divider />
                <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography variant="subtitle1">
                    {record.kind === 'client'
                      ? 'Buyers and contacts'
                      : 'Contacts'}
                  </Typography>
                  {canEditDetails ? (
                    <Button size="small" onClick={() => setContactForm(true)}>
                      Add contact
                    </Button>
                  ) : null}
                </Stack>
                {record.contacts.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    None.
                  </Typography>
                ) : (
                  <List dense aria-label="Contacts">
                    {record.contacts.map(contact => (
                      <ListItem
                        key={contact.id}
                        secondaryAction={
                          canEditDetails &&
                          record.kind === 'client' &&
                          contact.taxIdLast4 &&
                          !contact.isPrimaryTaxContact ? (
                            <Button
                              size="small"
                              onClick={() =>
                                run(() =>
                                  updateDirectoryRecord(
                                    'organizations',
                                    record.id,
                                    {
                                      primaryTaxContactId: contact.id,
                                      revision: record.revision,
                                    }
                                  )
                                )
                              }
                            >
                              Make primary tax contact
                            </Button>
                          ) : null
                        }
                      >
                        <ListItemText
                          primary={
                            <Button
                              variant="text"
                              size="small"
                              onClick={() => setOpenContact(contact.id)}
                            >
                              {recordName(contact)}
                            </Button>
                          }
                          secondary={[
                            withLabel(
                              contact.primaryEmail,
                              contact.primaryEmailLabel
                            ),
                            withLabel(
                              contact.primaryPhone,
                              contact.primaryPhoneLabel
                            ),
                            contact.isPrimaryContact ? 'Primary contact' : null,
                            contact.isBillingContact ? 'Billing contact' : null,
                            contact.isPrimaryTaxContact
                              ? 'Primary tax contact'
                              : null,
                            contact.portalAccess.status === 'off'
                              ? null
                              : `Portal access: ${contact.portalAccess.status}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          {abilities.write ? (
            record.archived ? (
              <Button
                onClick={() =>
                  run(() =>
                    restoreDirectoryRecord(
                      collection,
                      record.id,
                      record.revision
                    )
                  )
                }
              >
                Restore
              </Button>
            ) : (
              <>
                <Button color="warning" onClick={() => setConfirmArchive(true)}>
                  Archive
                </Button>
                <Button onClick={() => setEditing(true)}>Edit</Button>
              </>
            )
          ) : null}
          <Button variant="contained" onClick={onClose}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={confirmArchive}
        title="Archive record?"
        description="An archived record is hidden from lists until it is restored. Its emails, phones, and addresses are kept."
        confirmLabel="Archive"
        onConfirm={() => {
          setConfirmArchive(false);
          void run(
            () =>
              archiveDirectoryRecord(collection, record.id, record.revision),
            PORTAL_MESSAGES.archive
          );
        }}
        onCancel={() => setConfirmArchive(false)}
      />
      {editing ? (
        <RecordFormDialog
          collection={collection}
          record={record}
          canWriteTaxIds={abilities.writeTaxIds}
          onClose={() => setEditing(false)}
          onSaved={afterSave}
        />
      ) : null}
      {contactForm ? (
        <RecordFormDialog
          collection="organization-contacts"
          record={null}
          defaults={{
            organizationId: record.id,
            organizationKind: record.kind,
          }}
          canWriteTaxIds={abilities.writeTaxIds}
          onClose={() => setContactForm(false)}
          onSaved={afterSave}
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
