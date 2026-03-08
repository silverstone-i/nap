/**
 * @file Vendor SKU matching page — unmatched vendor SKUs, similarity matches, accept/reject/defer
 * @module nap-client/pages/BOM/VendorSkuMatchingPage
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import { DataGrid } from '@mui/x-data-grid';

import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useVendorSkus,
  useUnmatchedVendorSkus,
  useMatchVendorSku,
  useAutoMatchVendorSku,
  useBatchMatchVendorSkus,
  useRefreshVendorEmbeddings,
} from '../../hooks/useBom.js';
import { pageContainerSx } from '../../config/layoutTokens.js';
import { useDataGridSelection } from '../../hooks/useDataGridSelection.js';

const confidenceColor = (val) => {
  if (val >= 0.85) return 'success';
  if (val >= 0.6) return 'warning';
  return 'error';
};

const unmatchedColumns = [
  { field: 'vendor_sku', headerName: 'Vendor SKU', width: 160 },
  { field: 'description', headerName: 'Description', flex: 1, minWidth: 250 },
  {
    field: 'confidence',
    headerName: 'Best Confidence',
    width: 130,
    renderCell: ({ value }) => (value ? <Chip size="small" label={`${(value * 100).toFixed(1)}%`} color={confidenceColor(value)} /> : '-'),
  },
];

const matchColumns = [
  { field: 'catalog_sku', headerName: 'Catalog SKU', width: 160 },
  { field: 'description', headerName: 'Description', flex: 1, minWidth: 250 },
  {
    field: 'similarity',
    headerName: 'Confidence',
    width: 130,
    renderCell: ({ value }) => <Chip size="small" label={`${(value * 100).toFixed(1)}%`} color={confidenceColor(value)} />,
  },
];

export default function VendorSkuMatchingPage() {
  const { data: allRes, isLoading: allLoading } = useVendorSkus();
  const { data: unmatchedRes, isLoading: unmatchedLoading } = useUnmatchedVendorSkus();

  const allRows = allRes?.rows ?? [];
  const unmatchedRows = unmatchedRes?.data ?? [];

  const [viewMode, setViewMode] = useState('unmatched');
  const rows = useMemo(() => {
    if (viewMode === 'unmatched') return unmatchedRows;
    if (viewMode === 'matched') return allRows.filter((r) => r.catalog_sku_id && !r.deactivated_at);
    return allRows.filter((r) => !r.deactivated_at);
  }, [viewMode, unmatchedRows, allRows]);

  const { selectionModel, setSelectionModel, onSelectionChange, selected, isSingle } =
    useDataGridSelection(rows);

  const [matchResults, setMatchResults] = useState([]);
  const [matchSelection, setMatchSelection] = useState([]);

  const matchMut = useMatchVendorSku();
  const autoMatchMut = useAutoMatchVendorSku();
  const batchMatchMut = useBatchMatchVendorSkus();
  const refreshMut = useRefreshVendorEmbeddings();

  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  const handleFindMatches = async () => {
    if (!selected) return;
    try {
      const result = await matchMut.mutateAsync({ vendor_sku_id: selected.id, top_k: 5 });
      setMatchResults(result.data ?? []);
      setMatchSelection([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleAutoMatch = async () => {
    if (!selected) return;
    try {
      const result = await autoMatchMut.mutateAsync({ vendor_sku_id: selected.id });
      if (result.matched) {
        toast(`Matched with confidence ${(result.confidence * 100).toFixed(1)}%`);
        setMatchResults([]);
        setSelectionModel([]);
      } else {
        toast('No match above threshold — deferred', 'warning');
      }
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleBatchMatch = async () => {
    try {
      const ids = unmatchedRows.map((r) => r.id);
      if (ids.length === 0) { toast('No unmatched SKUs', 'info'); return; }
      const result = await batchMatchMut.mutateAsync({ vendor_sku_ids: ids });
      const matched = (result.data ?? []).filter((r) => r.matched).length;
      toast(`Batch complete: ${matched}/${ids.length} matched`);
      setMatchResults([]);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleRefreshEmbeddings = async () => {
    try {
      const result = await refreshMut.mutateAsync();
      toast(`Refreshed ${result.refreshed ?? 0} embeddings`);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const toolbar = useMemo(
    () => ({
      tabs: [
        { value: 'unmatched', label: 'Unmatched', selected: viewMode === 'unmatched', onClick: () => { setViewMode('unmatched'); setSelectionModel([]); setMatchResults([]); } },
        { value: 'matched', label: 'Matched', selected: viewMode === 'matched', onClick: () => { setViewMode('matched'); setSelectionModel([]); setMatchResults([]); } },
        { value: 'all', label: 'All', selected: viewMode === 'all', onClick: () => { setViewMode('all'); setSelectionModel([]); setMatchResults([]); } },
      ],
      filters: [],
      primaryActions: [
        { label: 'Find Matches', variant: 'contained', disabled: !isSingle || matchMut.isPending, onClick: handleFindMatches },
        { label: 'Auto Match', variant: 'outlined', disabled: !isSingle || autoMatchMut.isPending, onClick: handleAutoMatch },
        { label: 'Batch Match All', variant: 'outlined', color: 'secondary', disabled: batchMatchMut.isPending || unmatchedRows.length === 0, onClick: handleBatchMatch },
        { label: 'Refresh Embeddings', variant: 'outlined', disabled: refreshMut.isPending, onClick: handleRefreshEmbeddings },
      ],
    }),
    [selected, isSingle, viewMode, matchMut.isPending, autoMatchMut.isPending, batchMatchMut.isPending, refreshMut.isPending, unmatchedRows.length, setSelectionModel],
  );
  useModuleToolbarRegistration(toolbar);

  const isLoading = viewMode === 'unmatched' ? unmatchedLoading : allLoading;

  const displayColumns = viewMode === 'unmatched' ? unmatchedColumns : [
    { field: 'vendor_sku', headerName: 'Vendor SKU', width: 160 },
    { field: 'description', headerName: 'Description', flex: 1, minWidth: 250 },
    {
      field: 'confidence',
      headerName: 'Confidence',
      width: 130,
      renderCell: ({ value }) => (value ? <Chip size="small" label={`${(value * 100).toFixed(1)}%`} color={confidenceColor(value)} /> : '-'),
    },
    { field: 'catalog_sku_id', headerName: 'Matched', width: 100, valueGetter: (params) => (params.row.catalog_sku_id ? 'Yes' : 'No') },
  ];

  return (
    <Box sx={pageContainerSx}>
      {(batchMatchMut.isPending || refreshMut.isPending) && <LinearProgress sx={{ mb: 1 }} />}

      <DataGrid
        rows={rows}
        columns={displayColumns}
        getRowId={(r) => r.id}
        loading={isLoading}
        checkboxSelection
        rowSelectionModel={selectionModel}
        onRowSelectionModelChange={onSelectionChange}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        sx={{ flex: matchResults.length > 0 ? '1 1 50%' : '1 1 auto' }}
      />

      {/* Match Results Panel */}
      {matchResults.length > 0 && (
        <Paper sx={{ mt: 2, p: 2, flex: '1 1 40%' }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Match Suggestions for: {selected?.vendor_sku}
          </Typography>
          <DataGrid
            rows={matchResults}
            columns={matchColumns}
            getRowId={(r) => r.catalog_sku_id}
            checkboxSelection
            disableMultipleRowSelection
            rowSelectionModel={matchSelection}
            onRowSelectionModelChange={setMatchSelection}
            pageSizeOptions={[5]}
            initialState={{ pagination: { paginationModel: { pageSize: 5 } } }}
            autoHeight
          />
          <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
            <Button variant="contained" color="success" disabled={matchSelection.length === 0} onClick={handleAutoMatch}>
              Accept Match
            </Button>
            <Button variant="outlined" onClick={() => setMatchResults([])}>
              Dismiss
            </Button>
          </Box>
        </Paper>
      )}

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
