/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCallback, useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { listClientTenants } from '../../api/endpoints.js';
import { useCapabilities } from '../../auth/useCapabilities.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { ProvisionTenantDialog } from '../management/ProvisionTenantDialog.jsx';

/**
 * The tenant a Napsoft client was provisioned as, or a "Provision tenant"
 * action when it has none (I0006-R010). Shown only on a client of the
 * Napsoft tenant, to a session that can read tenants.
 * @param {{client: object}} props Client detail with its contacts.
 * @returns {JSX.Element|null}
 */
export function ClientTenantPanel({ client }) {
  const session = useSession();
  const { can } = useCapabilities();
  const napsoftSelected =
    session.selectedTenant != null &&
    session.selectedTenant.id === session.capabilities?.napsoftTenant?.id;
  const canRead = can('admin-tenancy::control::read', 'napsoft');
  const canWrite = can('admin-tenancy::control::write', 'napsoft');
  const visible = napsoftSelected && canRead;
  const [tenants, setTenants] = useState(null);
  const [provisioning, setProvisioning] = useState(false);

  const load = useCallback(() => {
    listClientTenants(client.id)
      .then(setTenants)
      .catch(() => setTenants([]));
  }, [client.id]);
  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  if (!visible || tenants === null) return null;
  const [tenant] = tenants;
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', justifyContent: 'space-between' }}
    >
      <Typography variant="body2">
        {tenant
          ? `Tenant: ${tenant.code} · ${tenant.job?.status === 'failed' ? 'provisioning failed' : tenant.provisioned ? 'provisioned' : 'provisioning'}`
          : 'Tenant: none'}
      </Typography>
      {!tenant && canWrite && !client.archived ? (
        <Button
          variant="outlined"
          size="small"
          onClick={() => setProvisioning(true)}
        >
          Provision tenant
        </Button>
      ) : null}
      {provisioning ? (
        <ProvisionTenantDialog
          client={client}
          onClose={() => setProvisioning(false)}
          onProvisioned={() => {
            setProvisioning(false);
            load();
          }}
        />
      ) : null}
    </Stack>
  );
}
