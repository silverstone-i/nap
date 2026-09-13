/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import type { controlResponseSchema, controlBodySchema } from '@nap/shared';
import type { z } from 'zod';
import { requestGeneration } from '../api/lifecycle.js';
import { command, overview } from '../api/control.js';
import { useSession } from '../auth/session.js';
import { defaultRowsPerPage } from '../lib/settings.js';
import {
  managementContentStyles,
  managementGridStyles,
  managementHeaderStyles,
} from '../theme/styles.js';

/** Does: Names validated cell rows. Used by: the management list. */
type Cell = z.infer<typeof controlResponseSchema>['data']['cells'][number];
/**
 * Does: Registers cells and shows durable provisioning progress and availability actions.
 * Called by: the Cells management routes.
 */
export function CellsPage() {
  const { state } = useSession();
  const navigate = useNavigate();
  const session = state.status === 'ready' ? state.session : null;
  const canView =
    session?.platformPermissions.includes('admin-tenancy::control::overview') ??
    false;
  const canMutate =
    session?.platformPermissions.includes('admin-tenancy::control::registry') ??
    false;
  const [cells, setCells] = useState<Cell[]>([]);
  const [environment, setEnvironment] = useState<'DEV' | 'TEST' | 'PROD'>(
    'TEST'
  );
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [register, setRegister] = useState(false);
  const [suffix, setSuffix] = useState('');
  const [busy, setBusy] = useState(false);
  const [copyNotice, setCopyNotice] = useState<{
    id: string;
  } | null>(null);
  const [progressCell, setProgressCell] = useState<Cell | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; cell: Cell } | null>(
    null
  );
  const [disable, setDisable] = useState<Cell | null>(null);
  const polling = cells.some(cell =>
    ['queued', 'running'].includes(cell.status ?? '')
  );
  useEffect(() => {
    if (!canView) return;
    let active = true;
    const generation = requestGeneration();
    /** Does: Refreshes saved progress for the current session. */
    const load = async () => {
      const result = await overview();
      if (!active || generation !== requestGeneration()) return;
      if (result.ok) {
        setCells(result.body.data.cells);
        setEnvironment(result.body.data.cellEnvironment);
        setError('');
      } else setError(result.error.message);
    };
    void load();
    const timer = polling
      ? setInterval(() => {
          void load();
        }, 2000)
      : undefined;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [canView, revision, polling, session?.actorId]);
  /** Does: Submits one authenticated operation and refreshes saved progress. Called by: registration and row actions. */
  async function submit(body: z.infer<typeof controlBodySchema>) {
    setBusy(true);
    setError('');
    setMessage('');
    const generation = requestGeneration();
    const result = await command(body);
    if (generation !== requestGeneration()) return;
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setRegister(false);
    setDisable(null);
    setMenu(null);
    setSuffix('');
    setMessage(
      body.operation === 'cell'
        ? 'Cell registered. Follow progress below.'
        : 'Cell action saved.'
    );
    setRevision(v => v + 1);
    void navigate('/management/cells');
  }
  /** Does: Copies the exact registered UUID. Called by: the UUID button. */
  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopyNotice({ id });
      setTimeout(() => {
        setCopyNotice(current => (current?.id === id ? null : current));
      }, 1500);
    } catch {
      setError('Could not copy UUID. Select and copy the displayed text.');
    }
  }
  function nextActionHint(cell?: Cell | null) {
    if (!cell) return 'Select a cell to view updated progress guidance.';
    if (cell.status === 'failed')
      return cell.failure_code
        ? `Resolve ${cell.failure_code} and retry the provisioning job.`
        : 'Resolve the provisioning issue and retry.';
    if (cell.status === 'queued' || cell.status === 'running')
      return 'Provisioning is active; retry is unavailable.';
    if (!cell.enabled)
      return 'Enable the cell and run registration/activation steps.';
    if (!cell.available) return 'Cell is registered but unavailable.';
    return 'Cell is enabled and available.';
  }
  const columns: GridColDef<Cell>[] = [
    {
      field: 'id',
      headerName: 'Cell UUID',
      minWidth: 340,
      flex: 1,
      renderCell: ({ row }) => (
        <Stack spacing={0.5}>
          <Button
            size="small"
            onClick={() => {
              void copy(row.id);
            }}
            sx={{ textTransform: 'none', userSelect: 'text' }}
            aria-label={`Copy cell UUID ${row.id}`}
          >
            {row.id}
          </Button>
          {copyNotice?.id === row.id && (
            <Typography variant="caption" color="success.main">
              Copied
            </Typography>
          )}
        </Stack>
      ),
    },
    {
      field: 'database_name',
      headerName: 'Database name',
      minWidth: 230,
      flex: 1,
    },
    {
      field: 'status',
      headerName: 'Status',
      minWidth: 220,
      flex: 1,
      renderCell: ({ row }) => (
        <Chip
          size="small"
          label={
            row.status === 'failed'
              ? `Failed: ${row.stage}`
              : row.status === 'queued'
                ? 'Queued'
                : row.status === 'running'
                  ? `Provisioning: ${row.stage}`
                  : row.enabled
                    ? row.available
                      ? 'Enabled'
                      : 'Unavailable'
                    : 'Disabled'
          }
          color={
            row.status === 'failed'
              ? 'error'
              : row.enabled
                ? 'success'
                : 'default'
          }
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 90,
      sortable: false,
      renderCell: ({ row }) => (
        <IconButton
          aria-label={`Actions for ${row.database_name}`}
          onClick={event => setMenu({ anchor: event.currentTarget, cell: row })}
        >
          <MoreVertIcon />
        </IconButton>
      ),
    },
  ];
  const name = `nap_${environment.toLowerCase()}_cell_${suffix}`;
  const valid =
    /^[a-z0-9_]+$/.test(suffix) && name.length <= 63 && environment !== 'TEST';
  const selected = menu?.cell;
  const working =
    selected && ['queued', 'running'].includes(selected.status ?? '');
  if (!canView)
    return (
      <Alert severity="error">You do not have permission to view cells.</Alert>
    );
  return (
    <Box sx={managementContentStyles}>
      <Box sx={managementHeaderStyles}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ width: '100%', alignItems: 'center' }}
        >
          <Typography variant="h5">Cells</Typography>
          <TextField
            size="small"
            label="Search cells"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
          <Box sx={{ flexGrow: 1 }} />
          <Button onClick={() => setRevision(v => v + 1)}>Refresh list</Button>
          {canMutate && environment !== 'TEST' && (
            <Button variant="contained" onClick={() => setRegister(true)}>
              Register cell
            </Button>
          )}
        </Stack>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {message && (
        <Alert severity="success" onClose={() => setMessage('')}>
          {message}
        </Alert>
      )}
      <Box sx={{ ...managementGridStyles, flex: 1, minHeight: 300 }}>
        <DataGrid
          rows={cells.filter(c =>
            `${c.id} ${c.database_name}`.includes(search)
          )}
          columns={columns}
          disableRowSelectionOnClick
          initialState={{
            pagination: { paginationModel: { pageSize: defaultRowsPerPage() } },
          }}
          pageSizeOptions={[10, 25, 50]}
        />
      </Box>
      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            setProgressCell(selected ?? null);
            setMenu(null);
          }}
        >
          View progress details
        </MenuItem>
        {canMutate &&
          selected &&
          !working &&
          !selected.enabled &&
          selected.status !== 'completed' && (
            <MenuItem
              onClick={() => {
                void submit({ operation: 'cell-retry', cell: selected.id });
              }}
            >
              Retry
            </MenuItem>
          )}
        {canMutate &&
          selected &&
          !working &&
          !selected.enabled &&
          ['seeded', 'enabled'].includes(selected.stage ?? '') && (
            <MenuItem
              onClick={() => {
                void submit({ operation: 'cell-activate', cell: selected.id });
              }}
            >
              Activate
            </MenuItem>
          )}
        {canMutate && selected && !working && selected.enabled && (
          <MenuItem
            onClick={() => {
              setDisable(selected);
              setMenu(null);
            }}
          >
            Disable
          </MenuItem>
        )}
      </Menu>
      <Dialog
        open={register}
        onClose={() => {
          if (!busy) setRegister(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Register cell</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="normal"
            label="Cell name suffix"
            value={suffix}
            onChange={event => setSuffix(event.target.value)}
            helperText="Lowercase letters, numbers and underscores."
          />
          <Typography>{name}</Typography>
          <Typography variant="body2">
            Creation, migrations, reference seeding and activation continue
            after you close this page.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setRegister(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || !valid}
            onClick={() => {
              void submit({ operation: 'cell', suffix });
            }}
          >
            Register cell
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!disable} onClose={() => setDisable(null)}>
        <DialogTitle>Disable {disable?.database_name}?</DialogTitle>
        <DialogContent>
          Assigned tenants will lose access while this cell is disabled.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDisable(null)}>Cancel</Button>
          <Button
            disabled={busy}
            onClick={() => {
              if (disable)
                void submit({ operation: 'cell-disable', cell: disable.id });
            }}
          >
            Disable
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!progressCell}
        onClose={() => setProgressCell(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Cell progress</DialogTitle>
        <DialogContent>
          <Stack spacing={1}>
            <Typography>
              <strong>UUID:</strong> {progressCell?.id}
            </Typography>
            <Typography>
              <strong>Status:</strong>{' '}
              {progressCell?.status
                ? progressCell.status.toUpperCase()
                : 'Not started'}
            </Typography>
            <Typography>
              <strong>Stage:</strong> {progressCell?.stage ?? 'registered'}
            </Typography>
            <Typography>
              <strong>Failure code:</strong>{' '}
              {progressCell?.failure_code ?? 'None'}
            </Typography>
            <Divider />
            <Typography>{nextActionHint(progressCell)}</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProgressCell(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
