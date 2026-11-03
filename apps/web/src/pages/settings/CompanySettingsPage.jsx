/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCallback, useEffect, useState } from 'react';
import { formatPhone } from '@nap/shared';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { getCompanyProfile, submitCompanyTaxId } from '../../api/endpoints.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { useCapabilities } from '../../auth/useCapabilities.js';
import { useEffectiveSettings } from '../../shell/EffectiveSettingsContext.jsx';
import { useNotice } from '../../shell/NoticeContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { describeDirectoryError } from '../directory/directoryErrors.js';
import { useTaxIdFormats } from '../directory/useTaxIdFormats.js';

const WRITE = 'business-directory::company-profile::write';

/**
 * The tax ID line: the approved value and any request waiting on Napsoft
 * (I0013-R021).
 * @param {object} taxId
 * @returns {string[]}
 */
function taxIdLines(taxId) {
  const lines = [
    taxId.last4 ? `Tax ID ending ${taxId.last4}` : 'No approved tax ID',
  ];
  if (taxId.status === 'pending')
    lines.push(`Tax ID ending ${taxId.pendingLast4}: pending approval`);
  if (taxId.status === 'rejected')
    lines.push(
      `Tax ID ending ${taxId.pendingLast4}: rejected. ${taxId.reason ?? ''}`.trim()
    );
  return lines;
}

/**
 * One contact's email and phone for a list row.
 * @param {object} contact
 * @param {string} country
 * @returns {string}
 */
function contactLine(contact, country) {
  return [contact.email, contact.phone && formatPhone(contact.phone, country)]
    .filter(Boolean)
    .join(' · ');
}

/** I0014-R031: the role groups, in order. */
const ROLE_GROUPS = [
  ['primaryContacts', 'Primary contacts'],
  ['billingContacts', 'Billing contacts'],
  ['notificationContacts', 'Notification contacts'],
];

/**
 * Submit a tax ID for Napsoft's approval (I0013-R019).
 * @param {{onClose: () => void, onSaved: (profile: object) => void}} props
 * @returns {JSX.Element}
 */
function TaxIdSubmitDialog({ onClose, onSaved }) {
  const formats = (useTaxIdFormats() ?? []).filter(format => !format.archived);
  const [formatId, setFormatId] = useState('');
  const [taxId, setTaxId] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const chosen =
    formatId || (formats.find(f => f.name === 'EIN') ?? formats[0])?.id || '';

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      onSaved(
        await submitCompanyTaxId({ taxId: taxId.trim(), taxIdFormatId: chosen })
      );
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
      aria-labelledby="company-tax-id-title"
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id="company-tax-id-title">Submit tax ID</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            label="Format"
            value={chosen}
            onChange={event => setFormatId(event.target.value)}
            required
            fullWidth
          >
            {formats.map(format => (
              <MenuItem key={format.id} value={format.id}>
                {format.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Tax ID"
            value={taxId}
            onChange={event => setTaxId(event.target.value)}
            required
            fullWidth
            autoComplete="off"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={saving || !chosen || !taxId.trim()}
        >
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * `/settings/company` (I0013-R026): a customer tenant's legal and DBA name,
 * which Napsoft keeps; its tax ID and any request waiting for Napsoft; and
 * the employees holding each contact role (I0014-R031). Roles are set on
 * each employee's detail.
 * @returns {JSX.Element}
 */
export function CompanySettingsPage() {
  const tenant = useSession().selectedTenant;
  const { can, onError } = useCapabilities();
  const canWrite = can(WRITE);
  const { defaultCountry } = useEffectiveSettings().settings;
  const notify = useNotice();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);

  const load = useCallback(() => {
    getCompanyProfile()
      .then(setProfile)
      .catch(err => {
        onError(err);
        setError(describeDirectoryError(err));
      });
  }, [onError]);
  useEffect(() => {
    if (tenant) load();
  }, [tenant, load]);

  usePageHeader({ title: 'Company' });

  if (!tenant)
    return <Alert severity="info">Select a tenant to see its company.</Alert>;
  if (!profile)
    return error ? (
      <Alert severity="error">{error}</Alert>
    ) : (
      <CircularProgress aria-label="Loading company" />
    );

  const saved = message => next => {
    setProfile(next);
    setDialog(null);
    notify(message);
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="subtitle1">Name</Typography>
        <Typography variant="body2">{profile.legalName}</Typography>
        {profile.dbaName ? (
          <Typography variant="body2">{`DBA name: ${profile.dbaName}`}</Typography>
        ) : null}
      </Stack>

      <Stack spacing={1}>
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Typography variant="subtitle1">Tax ID</Typography>
          {canWrite ? (
            <Button size="small" onClick={() => setDialog('taxId')}>
              Submit tax ID
            </Button>
          ) : null}
        </Stack>
        {taxIdLines(profile.taxId).map(line => (
          <Typography key={line} variant="body2">
            {line}
          </Typography>
        ))}
      </Stack>

      {ROLE_GROUPS.map(([group, title]) => (
        <Stack key={group} spacing={1}>
          <Typography variant="subtitle1">{title}</Typography>
          <List dense aria-label={title}>
            {profile[group].map(contact => (
              <ListItem key={contact.id} disableGutters>
                <ListItemText
                  primary={`${contact.firstName} ${contact.lastName}`}
                  secondary={contactLine(contact, defaultCountry)}
                />
              </ListItem>
            ))}
          </List>
        </Stack>
      ))}

      {dialog === 'taxId' ? (
        <TaxIdSubmitDialog
          onClose={() => setDialog(null)}
          onSaved={saved('Tax ID submitted for approval.')}
        />
      ) : null}
    </Stack>
  );
}
