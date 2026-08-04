/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useSearchParams } from 'react-router';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import { getInvoice, getInvoices, getProject } from '../mocks/data';
import type { Invoice } from '../mocks/types';
import { useScope } from '../shell/useScope';
import { formatCurrency, formatDate } from '../lib/format';
import { InvoiceStatusChip } from '../lib/StatusChip';
import { fontMono } from '../theme/tokens';
import { InvoicePreviewDrawer } from './InvoicePreviewDrawer';

export function InvoicesListPage() {
  const { entityId, projectId } = useScope();
  const [searchParams, setSearchParams] = useSearchParams();
  const invoices = getInvoices(entityId, projectId);

  // The open drawer is URL state (?invoice=) so deep links and back/forward
  // replay it — see docs/RULES/web-shell.md.
  const invoiceId = searchParams.get('invoice');
  const openInvoice = invoiceId ? getInvoice(entityId, invoiceId) : undefined;

  function setOpenInvoice(id: string | undefined) {
    setSearchParams(params => {
      if (id) params.set('invoice', id);
      else params.delete('invoice');
      return params;
    });
  }

  const columns: GridColDef<Invoice>[] = [
    { field: 'number', headerName: 'Number', width: 100 },
    { field: 'vendor', headerName: 'Vendor', flex: 1, minWidth: 200 },
    {
      field: 'projectId',
      headerName: 'Project',
      width: 110,
      valueGetter: (_value, row) =>
        getProject(entityId, row.projectId)?.code ?? '—',
    },
    {
      field: 'issuedDate',
      headerName: 'Issued',
      width: 120,
      valueFormatter: (value: string) => formatDate(value),
    },
    {
      field: 'dueDate',
      headerName: 'Due',
      width: 120,
      valueFormatter: (value: string) => formatDate(value),
    },
    {
      field: 'amount',
      headerName: 'Amount',
      type: 'number',
      width: 140,
      cellClassName: 'num-cell',
      valueFormatter: (value: number) => formatCurrency(value),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 170,
      renderCell: params => <InvoiceStatusChip status={params.row.status} />,
    },
  ];

  return (
    <Stack spacing={2}>
      <Typography variant="h6" component="h1">
        AP Invoices
      </Typography>
      <DataGrid
        rows={invoices}
        columns={columns}
        density="compact"
        autoHeight
        disableRowSelectionOnClick
        onRowClick={params => setOpenInvoice(String(params.id))}
        sx={{
          bgcolor: 'background.paper',
          fontSize: 13,
          '& .num-cell': { fontFamily: fontMono },
          '& .MuiDataGrid-row': { cursor: 'pointer' },
        }}
      />
      <InvoicePreviewDrawer
        invoice={openInvoice}
        onClose={() => setOpenInvoice(undefined)}
      />
    </Stack>
  );
}
