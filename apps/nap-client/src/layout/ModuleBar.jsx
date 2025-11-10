import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useMemo } from 'react';
import { useModuleActionsContext } from '../context/ModuleActionsContext.jsx';

export default function ModuleBar({ offsetTop = 64 }) {
  const { tabs = [], filters = [], primaryActions = [] } = useModuleActionsContext();
  const hasContent = Boolean((tabs && tabs.length) || (filters && filters.length) || (primaryActions && primaryActions.length));

  const sectionGap = useMemo(() => ({ xs: 2, sm: 3 }), []);

  return (
    <Box
      sx={{
        position: 'sticky',
        top: offsetTop,
        zIndex: (theme) => theme.zIndex.appBar - 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        spacing={sectionGap}
        sx={{ px: 3, py: 1.5, minHeight: 64 }}
      >
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={sectionGap} alignItems="center">
          {tabs?.map((tab) => (
            <Stack key={tab.id} direction="row" alignItems="center" spacing={1}>
              {tab.label && (
                <Typography variant="body2" color="text.secondary">
                  {tab.label}
                </Typography>
              )}
              <ToggleButtonGroup
                size="small"
                color="primary"
                exclusive={tab.exclusive !== false}
                value={tab.value}
                onChange={(_event, value) => {
                  if (value !== null && tab.onChange) tab.onChange(value);
                }}
              >
                {(tab.options || []).map((option) => (
                  <ToggleButton key={option.value} value={option.value} disableRipple>
                    {option.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Stack>
          ))}
          {filters?.map((filter) => (
            <Box key={filter.id} sx={{ minWidth: 180 }}>
              {filter.type === 'text' ? (
                <TextField
                  fullWidth
                  size="small"
                  label={filter.label}
                  value={filter.value ?? ''}
                  placeholder={filter.placeholder}
                  onChange={(event) => filter.onChange?.(event.target.value)}
                />
              ) : (
                <FormControl fullWidth size="small">
                  <InputLabel id={`${filter.id}-label`}>{filter.label}</InputLabel>
                  <Select
                    labelId={`${filter.id}-label`}
                    label={filter.label}
                    value={filter.value ?? ''}
                    onChange={(event) => filter.onChange?.(event.target.value)}
                  >
                    {(filter.options || []).map((option) => (
                      <MenuItem value={option.value} key={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>
          ))}
          {!hasContent && (
            <Typography variant="body2" color="text.disabled">
              Module-specific tools load here
            </Typography>
          )}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
          {(primaryActions || []).map((action) => (
            <Button
              key={action.id}
              size="small"
              variant={action.variant || 'contained'}
              color={action.color || 'primary'}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </Button>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}
