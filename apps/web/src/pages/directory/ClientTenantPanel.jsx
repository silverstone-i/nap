/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react';
import { formatPhone } from '@nap/shared';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ApiError } from '../../api/client.js';
import {
  approveTaxIdRequest,
  getTenantTaxIdRequest,
  listClientTenants,
  listTaxIdFormats,
  listTenantContacts,
  rejectTaxIdRequest,
} from '../../api/endpoints.js';
import { useCapabilities } from '../../auth/useCapabilities.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { createListPageAdapter } from '../../grid/listPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import { useNotice } from '../../shell/NoticeContext.jsx';
import { isNapsoftSelected } from './napsoftSession.js';

/**
 * The contact type text for a tenant contact.
 * @param {{isPrimaryContact: boolean, isBillingContact: boolean}} contact
 * @returns {string}
 */
function contactType(contact) {
  return [
    contact.isPrimaryContact && 'Primary contact',
    contact.isBillingContact && 'Billing contact',
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * The read-only grid of a tenant's primary and billing contacts
 * (I0013-R017). It has no portal column: Napsoft client contacts never hold
 * portal access (R018).
 */
const CONTACT_COLUMNS = [
  {
    field: 'name',
    headerName: 'Name',
    flex: 1,
    priority: 'essential',
    valueGetter: (value, row) => `${row.firstName} ${row.lastName}`,
  },
  { field: 'email', headerName: 'Email', flex: 1, priority: 'essential' },
  {
    field: 'phone',
    headerName: 'Phone',
    flex: 1,
    valueFormatter: value => (value ? formatPhone(value) : '—'),
  },
  {
    field: 'billingPhone',
    headerName: 'Billing phone',
    flex: 1,
    valueFormatter: value => (value ? formatPhone(value) : '—'),
  },
  {
    field: 'contactType',
    headerName: 'Contact type',
    flex: 1,
    priority: 'essential',
    valueGetter: (value, row) => contactType(row),
  },
].map(column => ({ sortable: false, filterable: false, ...column }));

/**
 * Napsoft's decision on a tenant's tax ID request (I0013-R022, R023).
 * @param {{client: object, request: object, approving: boolean, onClose: () => void, onDone: (message: string) => void}} props
 * @returns {JSX.Element}
 */
function TaxIdDecisionDialog({ client, request, approving, onClose, onDone }) {
  const [formats, setFormats] = useState([]);
  const [formatId, setFormatId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!approving) return;
    listTaxIdFormats()
      .then(rows => {
        const usable = rows.filter(
          row => !row.archived && row.country === request.country
        );
        setFormats(usable);
        setFormatId(
          (usable.find(row => row.name === 'EIN') ?? usable[0])?.id ?? ''
        );
      })
      .catch(() => setFormats([]));
  }, [approving, request.country]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (approving) await approveTaxIdRequest(client.id, formatId);
      else await rejectTaxIdRequest(client.id, reason.trim());
      onDone(approving ? 'Tax ID approved.' : 'Tax ID rejected.');
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'DUPLICATE_TAX_ID'
          ? 'Another client already has this tax ID.'
          : err instanceof ApiError && err.code === 'INVALID_STATE'
            ? 'This request is no longer pending.'
            : 'Something went wrong. Please try again.'
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
      aria-labelledby="tax-id-decision-title"
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id="tax-id-decision-title">
        {approving ? 'Approve tax ID?' : 'Reject tax ID?'}
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2">{`Tax ID ending ${request.last4}`}</Typography>
          {approving ? (
            <TextField
              select
              label="Format"
              value={formatId}
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
          ) : (
            <TextField
              label="Reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              required
              fullWidth
              multiline
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={saving || (approving ? !formatId : !reason.trim())}
        >
          {approving ? 'Approve' : 'Reject'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * A Napsoft client's tenant (I0006-R010): its provisioning status, its
 * pending tax ID request (I0013-R029), and its primary and billing
 * contacts, which the tenant owns (R017). Shown only on a client of the
 * Napsoft tenant, to a session that can read tenants. Provisioning starts
 * on the Tenants screen (R005).
 * @param {{client: object, onChanged?: () => void}} props
 * @returns {JSX.Element|null}
 */
export function ClientTenantPanel({ client, onChanged }) {
  const session = useSession();
  const { can } = useCapabilities();
  const notify = useNotice();
  const canRead = can('admin-tenancy::control::read', 'napsoft');
  const canApprove = can('business-directory::tax-ids::approve');
  const visible = isNapsoftSelected(session) && canRead;
  const [deciding, setDeciding] = useState(null);
  // The request just decided here: admin records the decision only once the
  // sync delivers it, so it may still read as pending for a moment.
  const [decided, setDecided] = useState(null);
  const [tick, setTick] = useState(0);

  // Each response is kept with the client it belongs to, so another
  // client's tenants never show here, and a late response is ignored.
  const [loadedTenants, setLoadedTenants] = useState(null);
  useEffect(() => {
    if (!visible) return undefined;
    let current = true;
    const keep = rows => current && setLoadedTenants({ key: client.id, rows });
    listClientTenants(client.id)
      .then(keep)
      .catch(() => keep([]));
    return () => {
      current = false;
    };
  }, [visible, client.id]);
  const tenants = loadedTenants?.key === client.id ? loadedTenants.rows : null;

  const tenantId = tenants?.[0]?.id ?? null;
  const requestKey = `${tenantId}:${tick}`;
  const [loadedRequest, setLoadedRequest] = useState(null);
  useEffect(() => {
    if (!tenantId) return undefined;
    let current = true;
    const keep = value =>
      current && setLoadedRequest({ key: `${tenantId}:${tick}`, value });
    getTenantTaxIdRequest(tenantId)
      .then(keep)
      .catch(() => keep(null));
    return () => {
      current = false;
    };
  }, [tenantId, tick]);
  const request =
    tenantId && loadedRequest?.key === requestKey ? loadedRequest.value : null;
  const fetchContacts = useMemo(
    () =>
      createListPageAdapter(() =>
        tenantId ? listTenantContacts(tenantId) : Promise.resolve([])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a decision reloads afresh
    [tenantId, tick]
  );

  if (!visible || tenants === null) return null;
  const [tenant] = tenants;
  return (
    <Stack spacing={2}>
      {tenant ? (
        <Typography variant="body2">
          {`Tenant: ${tenant.code} · ${tenant.job?.status === 'failed' ? 'provisioning failed' : tenant.provisioned ? 'provisioned' : 'provisioning'}`}
        </Typography>
      ) : null}
      {request?.status === 'pending' && request.revision !== decided ? (
        <Alert
          severity="info"
          action={
            canApprove ? (
              <Stack direction="row" spacing={1}>
                <Button size="small" onClick={() => setDeciding('approve')}>
                  Approve
                </Button>
                <Button size="small" onClick={() => setDeciding('reject')}>
                  Reject
                </Button>
              </Stack>
            ) : null
          }
        >
          {`Tax ID ending ${request.last4} is waiting for approval.`}
        </Alert>
      ) : null}
      {tenant ? (
        <>
          <Typography variant="subtitle1">Contacts</Typography>
          <StandardDataGrid
            columns={CONTACT_COLUMNS}
            fetchPage={fetchContacts}
            resetKey={tick}
            selectable={false}
            ariaLabel="Tenant contacts"
            emptyMessage="No contacts yet."
          />
        </>
      ) : null}
      {deciding ? (
        <TaxIdDecisionDialog
          client={client}
          request={request}
          approving={deciding === 'approve'}
          onClose={() => setDeciding(null)}
          onDone={message => {
            setDecided(request.revision);
            setDeciding(null);
            notify(message);
            setTick(value => value + 1);
            onChanged?.();
          }}
        />
      ) : null}
    </Stack>
  );
}
