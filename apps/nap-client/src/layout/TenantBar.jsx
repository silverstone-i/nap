import {
  Avatar,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';

export default function TenantBar({
  height = 48,
  tenants,
  activeTenantId,
  onTenantChange,
  session,
  onSignOut,
}) {
  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        bgcolor: 'background.paper',
        height,
        py: 1,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, height: '100%' }}>
        <FormControl
          size="small"
          sx={{
            minWidth: 220,
            '& .MuiOutlinedInput-root': { height: 32 },
            '& .MuiSelect-select': { py: 0.25 },
          }}
        >
          <InputLabel id="tenant-select-label">Tenant</InputLabel>
          <Select
            labelId="tenant-select-label"
            id="tenant-select"
            label="Tenant"
            value={activeTenantId ?? ''}
            onChange={(event) => onTenantChange?.(event.target.value)}
            sx={{ height: 32 }}
          >
            {tenants.map((tenant) => (
              <MenuItem value={tenant.id} key={tenant.id}>
                {tenant.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Stack direction="row" alignItems="center" spacing={2}>
          {session && (
            <>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="subtitle2">{session.name || session.email || 'User'}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {session.role || 'Member'}
                </Typography>
              </Box>
              <Avatar sx={{ width: 32, height: 32 }}>
                {session?.name?.slice(0, 1)?.toUpperCase() || session?.email?.slice(0, 1)?.toUpperCase() || 'N'}
              </Avatar>
            </>
          )}
          <Button size="small" variant="outlined" onClick={onSignOut} sx={{ height: 32 }}>
            Sign out
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
