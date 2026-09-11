/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { controlBodySchema } from '@nap/shared';
import type { controlResponseSchema } from '@nap/shared';
import type { z } from 'zod';
import { command, overview } from '../api/control.js';
import { requestGeneration } from '../api/lifecycle.js';
import { useSession } from '../auth/session.js';
import { defaultRowsPerPage } from '../lib/settings.js';
import { useShell } from '../shell/scope.js';
import {
  managementContentStyles,
  managementFormStyles,
  managementGridStyles,
  managementHeaderStyles,
} from '../theme/styles.js';

/** Does: Names one validated overview cell. Used by: the Cells list and form. */
type Cell = z.infer<typeof controlResponseSchema>['data']['cells'][number];

/**
 * Does: Presents authorized cell registry listing, registration and editing.
 * Called by: the Cells routes under Tenant Management.
 */
export function CellsPage() {
  const scope = useShell();
  const { state } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [cells, setCells] = useState<Cell[] | null>(null);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<'error' | 'success'>('error');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rowMenu, setRowMenu] = useState<{
    anchor: HTMLElement;
    id: string;
  } | null>(null);
  const session = state.status === 'ready' ? state.session : null;
  const canMutate =
    session?.platformPermissions.includes('admin-tenancy::control::registry') ??
    false;

  useEffect(() => {
    let active = true;
    void overview().then(result => {
      if (!active) return;
      if (result.ok) {
        setCells(result.body.data.cells);
      } else {
        setCells(null);
        setSeverity('error');
        setMessage(result.error.message);
      }
    });
    return () => {
      active = false;
    };
  }, [revision]);

  /** Does: Updates cell-list URL state while retaining unrelated parameters. */
  function changeView(values: Record<string, string>, replace = false) {
    const query = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    void navigate(`${location.pathname}?${query}`, { replace });
  }
  const columns: GridColDef<Cell>[] = useMemo(
    () => [
      { field: 'code', headerName: 'Code', minWidth: 150, flex: 1 },
      {
        field: 'name',
        headerName: 'Name',
        minWidth: 220,
        flex: 2,
        renderCell: params => (
          <Button
            component={Link}
            tabIndex={params.hasFocus ? 0 : -1}
            to={`/management/cells/${params.row.id}`}
          >
            {params.row.name}
          </Button>
        ),
      },
      {
        field: 'enabled',
        headerName: 'Enabled',
        width: 130,
        renderCell: params => (
          <Chip
            size="small"
            variant="outlined"
            color={params.value ? 'success' : 'default'}
            label={params.value ? 'Enabled' : 'Disabled'}
          />
        ),
      },
      {
        field: 'actions',
        headerName: 'Actions',
        width: 85,
        sortable: false,
        filterable: false,
        renderCell: params => (
          <IconButton
            size="small"
            tabIndex={params.hasFocus ? 0 : -1}
            aria-label={`Actions for ${params.row.name}`}
            aria-haspopup="menu"
            onClick={event =>
              setRowMenu({ anchor: event.currentTarget, id: params.row.id })
            }
          >
            <MoreVertIcon />
          </IconButton>
        ),
      },
    ],
    []
  );

  if (scope.create && !canMutate)
    return <Alert severity="warning">This action is unavailable.</Alert>;
  if (!cells)
    return message ? (
      <Alert severity="error">
        {message}{' '}
        <Button onClick={() => setRevision(value => value + 1)}>Retry</Button>
      </Alert>
    ) : (
      <Typography role="status">Loading cells…</Typography>
    );
  const selected = cells.find(cell => cell.id === scope.target);
  if (scope.target && !selected)
    return <Alert severity="warning">Cell unavailable.</Alert>;
  if (scope.create || selected)
    return (
      <CellForm
        cell={selected}
        cells={cells}
        canMutate={canMutate}
        busy={busy}
        message={message}
        severity={severity}
        onBusy={setBusy}
        onMessage={(value, nextSeverity) => {
          setMessage(value);
          setSeverity(nextSeverity);
        }}
        onSaved={() => setRevision(value => value + 1)}
      />
    );

  const size = defaultRowsPerPage();
  const filtered = cells.filter(
    cell =>
      (!scope.status ||
        (scope.status === 'enabled' && cell.enabled) ||
        (scope.status === 'disabled' && !cell.enabled)) &&
      `${cell.code} ${cell.name}`
        .toLowerCase()
        .includes(scope.search.toLowerCase())
  );
  const page = Math.min(
    scope.page,
    Math.max(0, Math.ceil(filtered.length / size) - 1)
  );
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%',
      }}
    >
      <Toolbar aria-label="Feature controls" sx={managementHeaderStyles}>
        <Typography component="h1" variant="h6">
          Cells
        </Typography>
        <TextField
          size="small"
          label="Search cells"
          value={scope.search}
          onChange={event =>
            changeView({ q: event.target.value, page: '' }, true)
          }
        />
        <TextField
          select
          size="small"
          label="Status"
          value={scope.status}
          sx={{ minWidth: 135 }}
          onChange={event =>
            changeView({ status: event.target.value, page: '' })
          }
        >
          <MenuItem value="">All statuses</MenuItem>
          <MenuItem value="enabled">Enabled</MenuItem>
          <MenuItem value="disabled">Disabled</MenuItem>
        </TextField>
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={() => setRevision(value => value + 1)}>
          Refresh list
        </Button>
        {canMutate && (
          <Button
            component={Link}
            to="/management/cells/new"
            variant="contained"
          >
            Register cell
          </Button>
        )}
      </Toolbar>
      <Box sx={managementContentStyles}>
        <Box sx={managementGridStyles}>
          <DataGrid
            aria-label="Cells"
            rows={filtered}
            columns={columns}
            disableRowSelectionOnClick
            disableColumnFilter
            paginationModel={{ page, pageSize: size }}
            pageSizeOptions={[size]}
            onPaginationModelChange={model => {
              if (model.page !== page)
                changeView({ page: model.page ? String(model.page) : '' });
            }}
            sortModel={
              columns.some(
                column =>
                  column.field === scope.sort && column.sortable !== false
              )
                ? [
                    {
                      field: scope.sort,
                      sort: scope.descending ? 'desc' : 'asc',
                    },
                  ]
                : []
            }
            onSortModelChange={model =>
              changeView({
                sort: model[0]?.field ?? '',
                direction: model[0]?.sort ?? '',
                page: '',
              })
            }
            localeText={{
              noRowsLabel: cells.length
                ? 'No matching cells.'
                : 'No cells registered.',
            }}
          />
          <Menu
            anchorEl={rowMenu?.anchor}
            open={!!rowMenu}
            onClose={() => setRowMenu(null)}
          >
            <MenuItem
              component={Link}
              to={`/management/cells/${rowMenu?.id ?? ''}`}
              onClick={() => setRowMenu(null)}
            >
              {canMutate ? 'Edit cell' : 'View cell'}
            </MenuItem>
          </Menu>
        </Box>
      </Box>
    </Box>
  );
}

/** Does: Renders and submits one explicit cell create or edit form. Called by: CellsPage record routes. */
function CellForm({
  cell,
  cells,
  canMutate,
  busy,
  message,
  severity,
  onBusy,
  onMessage,
  onSaved,
}: {
  cell: Cell | undefined;
  cells: Cell[];
  canMutate: boolean;
  busy: boolean;
  message: string;
  severity: 'error' | 'success';
  onBusy: (busy: boolean) => void;
  onMessage: (message: string, severity: 'error' | 'success') => void;
  onSaved: () => void;
}) {
  const navigate = useNavigate();
  const mounted = useRef(true);
  const [code, setCode] = useState(cell?.code ?? '');
  const [name, setName] = useState(cell?.name ?? '');
  const [enabled, setEnabled] = useState(cell?.enabled ?? true);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [duplicate, setDuplicate] = useState<Cell | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Does: Validates and saves the current cell values after any required confirmation. */
  async function save() {
    const parsed = controlBodySchema.safeParse({
      operation: 'cell',
      code,
      name,
      enabled,
    });
    if (!parsed.success || parsed.data.operation !== 'cell') {
      onMessage('Check the fields and try again.', 'error');
      return;
    }
    const body = parsed.data;
    if (!cell) {
      const listed = cells.find(item => item.code === body.code);
      if (listed) {
        setDuplicate(listed);
        return;
      }
    }
    onBusy(true);
    onMessage('', 'error');
    const generation = requestGeneration();
    const result = await command(body);
    if (!mounted.current || generation !== requestGeneration()) return;
    onBusy(false);
    if (result.ok) {
      onMessage('Cell saved.', 'success');
      onSaved();
      if (!cell) await navigate('/management/cells');
    } else onMessage(result.error.message, 'error');
  }

  /** Does: Intercepts form submission to confirm loss of assigned tenant access. */
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cell?.enabled && !enabled) setConfirmDisable(true);
    else void save();
  }
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%',
      }}
    >
      <Toolbar aria-label="Feature controls" sx={managementHeaderStyles}>
        <Typography component="h1" variant="h6">
          {cell ? cell.name : 'Register cell'}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button component={Link} to="/management/cells">
          All cells
        </Button>
      </Toolbar>
      <Box sx={managementContentStyles}>
        {message && <Alert severity={severity}>{message}</Alert>}
        {duplicate && (
          <Alert
            severity="warning"
            action={
              <Button
                component={Link}
                to={`/management/cells/${duplicate.id}`}
                color="inherit"
              >
                Edit cell
              </Button>
            }
          >
            Cell code {duplicate.code} is already registered.
          </Alert>
        )}
        {canMutate ? (
          <Stack
            component="form"
            spacing={2}
            sx={managementFormStyles}
            onSubmit={submit}
          >
            <TextField
              label="Cell code"
              value={code}
              onChange={event => setCode(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 64 } }}
              helperText="Use the code configured for the deployed cell."
              required
              disabled={!!cell}
            />
            <TextField
              label="Cell name"
              value={name}
              onChange={event => setName(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 128 } }}
              required
            />
            <FormControlLabel
              control={
                <Switch
                  checked={enabled}
                  onChange={event => setEnabled(event.target.checked)}
                />
              }
              label="Enabled"
            />
            {!cell && (
              <Typography variant="body2" color="text.secondary">
                Registering a cell records configured infrastructure; it does
                not start or deploy the cell.
              </Typography>
            )}
            <Stack direction="row" spacing={1}>
              <Button type="submit" variant="contained" disabled={busy}>
                Save
              </Button>
              <Button component={Link} to="/management/cells" disabled={busy}>
                Cancel
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={2} sx={managementFormStyles}>
            <Typography>
              <strong>Code:</strong> {cell?.code}
            </Typography>
            <Typography>
              <strong>Name:</strong> {cell?.name}
            </Typography>
            <Chip
              sx={{ alignSelf: 'flex-start' }}
              label={cell?.enabled ? 'Enabled' : 'Disabled'}
              color={cell?.enabled ? 'success' : 'default'}
              variant="outlined"
            />
          </Stack>
        )}
      </Box>
      <Dialog open={confirmDisable} onClose={() => setConfirmDisable(false)}>
        <DialogTitle>Disable {cell?.name}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Assigned tenants will lose access while this cell is disabled.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDisable(false)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => {
              setConfirmDisable(false);
              void save();
            }}
          >
            Disable cell
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
