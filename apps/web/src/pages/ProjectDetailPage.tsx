/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Navigate, useParams, useSearchParams } from 'react-router';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { getProject } from '../mocks/data';
import { useScope } from '../shell/useScope';
import { formatCurrency, formatDate } from '../lib/format';
import { ProjectStatusChip } from '../lib/StatusChip';
import { fontMono } from '../theme/tokens';

const TABS = ['overview', 'lines', 'documents', 'activity'] as const;
type TabKey = (typeof TABS)[number];

function Numeric({ children }: { children: React.ReactNode }) {
  return (
    <TableCell align="right" sx={{ fontFamily: fontMono, fontSize: 13 }}>
      {children}
    </TableCell>
  );
}

export function ProjectDetailPage() {
  const { entityId } = useScope();
  const { projectId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const project = getProject(entityId, projectId);

  if (!project) return <Navigate to={`/${entityId}/projects`} replace />;

  const rawTab = searchParams.get('tab');
  const tab: TabKey = TABS.includes(rawTab as TabKey)
    ? (rawTab as TabKey)
    : 'overview';

  function setTab(next: TabKey) {
    setSearchParams(params => {
      params.set('tab', next);
      return params;
    });
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h6" component="h1">
          {project.code} — {project.name}
        </Typography>
        <ProjectStatusChip status={project.status} />
      </Stack>
      <Typography variant="body2" color="text.secondary">
        Manager {project.manager} · Started {formatDate(project.startDate)} ·
        Budget {formatCurrency(project.budget)}
      </Typography>

      {/* Navy default indicator — the rail's gold bar is the screen's single
          active-nav indicator (gold discipline). */}
      <Tabs value={tab} onChange={(_e, v: TabKey) => setTab(v)}>
        <Tab label="Overview" value="overview" />
        <Tab label="Line items" value="lines" />
        <Tab label="Documents" value="documents" />
        <Tab label="Activity" value="activity" />
      </Tabs>

      {tab === 'overview' && (
        <Stack direction="row" spacing={2}>
          {(
            [
              ['Budget', project.budget],
              ['Committed', project.committed],
              ['Actual', project.actual],
              ['Remaining', project.budget - project.actual],
            ] as const
          ).map(([label, amount]) => (
            <Paper key={label} variant="outlined" sx={{ p: 2, minWidth: 180 }}>
              <Typography variant="body2" color="text.secondary">
                {label}
              </Typography>
              <Typography sx={{ fontFamily: fontMono, fontSize: 18 }}>
                {formatCurrency(amount)}
              </Typography>
            </Paper>
          ))}
        </Stack>
      )}

      {tab === 'lines' && (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Cost code</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Budget</TableCell>
                <TableCell align="right">Committed</TableCell>
                <TableCell align="right">Actual</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {project.lines.map(line => (
                <TableRow key={line.costCode}>
                  <TableCell sx={{ fontFamily: fontMono, fontSize: 13 }}>
                    {line.costCode}
                  </TableCell>
                  <TableCell>{line.description}</TableCell>
                  <Numeric>{formatCurrency(line.budget)}</Numeric>
                  <Numeric>{formatCurrency(line.committed)}</Numeric>
                  <Numeric>{formatCurrency(line.actual)}</Numeric>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {tab === 'documents' && (
        <Typography color="text.secondary">
          Documents will appear here once file storage lands.
        </Typography>
      )}

      {tab === 'activity' && (
        <Typography color="text.secondary">
          The audit trail will appear here once the activity log lands.
        </Typography>
      )}

      <Box />
    </Stack>
  );
}
