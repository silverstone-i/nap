import { useMemo, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { useModuleToolbarRegistration } from '../../context/ModuleActionsContext.jsx';

export default function ScheduleTimelinePage() {
  const [period, setPeriod] = useState('week');
  const [location, setLocation] = useState('all');

  const registration = useMemo(
    () => ({
      tabs: [
        {
          id: 'period-view',
          label: 'Period',
          value: period,
          options: [
            { label: 'Day', value: 'day' },
            { label: 'Week', value: 'week' },
            { label: 'Month', value: 'month' },
          ],
          onChange: setPeriod,
        },
      ],
      filters: [
        {
          id: 'location-filter',
          label: 'Location',
          type: 'select',
          value: location,
          options: [
            { label: 'All locations', value: 'all' },
            { label: 'NAP HQ', value: 'hq' },
            { label: 'NAP EMEA', value: 'emea' },
          ],
          onChange: setLocation,
        },
      ],
      primaryActions: [
        {
          id: 'publish-schedule',
          label: 'Publish',
          variant: 'contained',
          color: 'primary',
          onClick: () => console.info('Publishing schedule for', period, location),
        },
      ],
    }),
    [location, period]
  );

  useModuleToolbarRegistration(() => registration, [registration]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Schedule timeline
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Use the module toolbar to switch periods or publish upcoming schedules. Selected view: {period}. Location scope: {location}.
      </Typography>
      <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Timeline canvas placeholder
        </Typography>
      </Paper>
    </Box>
  );
}
