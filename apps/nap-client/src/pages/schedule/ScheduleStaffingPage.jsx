import { useMemo, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { useModuleToolbarRegistration } from '../../context/ModuleActionsContext.jsx';

export default function ScheduleStaffingPage() {
  const [skill, setSkill] = useState('all');
  const [search, setSearch] = useState('');

  const registration = useMemo(
    () => ({
      filters: [
        {
          id: 'skill-filter',
          label: 'Skill',
          type: 'select',
          value: skill,
          options: [
            { label: 'All skills', value: 'all' },
            { label: 'Merchandising', value: 'merch' },
            { label: 'Ops', value: 'ops' },
          ],
          onChange: setSkill,
        },
        {
          id: 'staff-search',
          label: 'Search',
          type: 'text',
          value: search,
          placeholder: 'Find a team member',
          onChange: setSearch,
        },
      ],
      primaryActions: [
        {
          id: 'share-plan',
          label: 'Share plan',
          variant: 'outlined',
          color: 'primary',
          onClick: () => console.info('Sharing staffing plan for', skill),
        },
      ],
    }),
    [search, skill]
  );

  useModuleToolbarRegistration(() => registration, [registration]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Staffing view
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Filter staffing demand by skill and quickly search across your roster.
      </Typography>
      <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Staffing heatmap placeholder — filters value: {skill}, search input: {search || 'n/a'}
        </Typography>
      </Paper>
    </Box>
  );
}
