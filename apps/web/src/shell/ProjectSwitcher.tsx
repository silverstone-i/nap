/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { getProjects } from '../mocks/data';
import { useScope } from './useScope';

const ALL = '__all__';

export function ProjectSwitcher() {
  const { entityId, projectId, setProject } = useScope();
  const projects = getProjects(entityId);

  return (
    <TextField
      select
      size="small"
      value={projectId ?? ALL}
      onChange={e =>
        setProject(e.target.value === ALL ? undefined : e.target.value)
      }
      slotProps={{ htmlInput: { 'aria-label': 'Project' } }}
      sx={{ minWidth: 220 }}
    >
      <MenuItem value={ALL}>All projects</MenuItem>
      {projects.map(project => (
        <MenuItem key={project.id} value={project.id}>
          {project.code} — {project.name}
        </MenuItem>
      ))}
    </TextField>
  );
}
