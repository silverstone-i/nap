import { useMemo, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { useModuleToolbarRegistration } from '../../context/ModuleActionsContext.jsx';

export default function RulesLibraryPage() {
  const [mode, setMode] = useState('drafts');

  const registration = useMemo(
    () => ({
      tabs: [
        {
          id: 'rules-mode',
          label: 'Mode',
          value: mode,
          options: [
            { label: 'Drafts', value: 'drafts' },
            { label: 'Published', value: 'published' },
          ],
          onChange: setMode,
        },
      ],
      primaryActions: [
        {
          id: 'save-rules',
          label: 'Save changes',
          variant: 'contained',
          color: 'secondary',
          onClick: () => console.info('Saving rules library in', mode, 'mode'),
        },
      ],
    }),
    [mode]
  );

  useModuleToolbarRegistration(() => registration, [registration]);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Rules library
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Toggle between draft and published rule sets. Your primary actions remain visible within the module bar.
      </Typography>
      <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Library grid placeholder — active mode: {mode}
        </Typography>
      </Paper>
    </Box>
  );
}
