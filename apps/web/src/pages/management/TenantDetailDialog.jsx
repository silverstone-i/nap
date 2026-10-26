/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import { listCellsOverview } from '../../api/endpoints.js';
import { DetailDialog } from './DetailDialog.jsx';

const yesNo = value => (value ? 'Yes' : 'No');

/**
 * A tenant's detail (I0006-R020): tier, cell, readiness, and its
 * provisioning job, with View client and Retry when each applies.
 * @param {{tenant: object, onViewClient?: () => void, onRetry?: () => void, onClose: () => void}} props
 *   `tenant` is a grid row: the tenant with its job flattened. Pass
 *   `onViewClient` or `onRetry` only when that action applies.
 * @returns {JSX.Element}
 */
export function TenantDetailDialog({ tenant, onViewClient, onRetry, onClose }) {
  const [cellName, setCellName] = useState(null);
  useEffect(() => {
    if (!tenant.cellId) return undefined;
    let live = true;
    listCellsOverview({ limit: 100 })
      .then(page => {
        const found = page.rows.find(row => row.cell.id === tenant.cellId);
        if (live && found) setCellName(found.cell.database_name);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [tenant.cellId]);

  return (
    <DetailDialog
      id="tenant-detail-title"
      title={`${tenant.name} (${tenant.code})`}
      rows={[
        ['Status', tenant.status],
        ['Tier', tenant.tier],
        ['Cell', cellName ?? tenant.cellId],
        ['Provisioned', yesNo(tenant.provisioned)],
        ['Roles ready', yesNo(tenant.rbacReady)],
        ['Stage', tenant.stage],
        ['Provisioning', tenant.jobStatus],
        ['Attempts', tenant.attempts],
        ['Failure code', tenant.failureCode],
      ]}
      actions={[
        onViewClient && { label: 'View client', onClick: onViewClient },
        onRetry && { label: 'Retry', onClick: onRetry },
      ].filter(Boolean)}
      onClose={onClose}
    />
  );
}
