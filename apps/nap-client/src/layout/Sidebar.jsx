import { useMemo } from 'react';
import {
  Box,
  Collapse,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

const SIDEBAR_WIDTH = 264;
const SIDEBAR_COLLAPSED_WIDTH = 80;

export default function Sidebar({
  logo,
  items,
  collapsed,
  onToggleCollapse,
  activePrimaryId,
  activeModuleId,
  onPrimarySelect,
  onModuleSelect,
}) {
  const width = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  const activePrimaryItem = useMemo(() => items.find((item) => item.id === activePrimaryId), [items, activePrimaryId]);

  return (
    <Box
      component="aside"
      sx={{
        width,
        flexShrink: 0,
        borderRight: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        transition: (theme) => theme.transitions.create('width', { duration: theme.transitions.duration.short }),
        height: '100vh',
        position: 'sticky',
        top: 0,
        zIndex: (theme) => theme.zIndex.drawer,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          p: 2,
          minHeight: 72,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Box component="img" src={logo} alt="NAP" sx={{ height: 40, width: 'auto', opacity: 0.9 }} />
        </Box>
        <IconButton aria-label="Toggle sidebar" size="small" onClick={onToggleCollapse} sx={{ ml: 1 }}>
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Box>
      <Divider />
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        <List component="nav" disablePadding>
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activePrimaryId;
            return (
              <Box key={item.id}>
                <Tooltip title={collapsed ? item.label : ''} placement="right">
                  <ListItemButton
                    selected={isActive}
                    onClick={() => onPrimarySelect?.(item)}
                    sx={{
                      py: 1,
                      px: collapsed ? 2 : 3,
                    }}
                  >
                    {Icon && (
                      <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, color: 'text.primary' }}>
                        <Icon fontSize="small" />
                      </ListItemIcon>
                    )}
                    {!collapsed && <ListItemText primary={<Typography variant="body2">{item.label}</Typography>} />}
                  </ListItemButton>
                </Tooltip>
                {!collapsed && (
                  <Collapse in={isActive} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                      {(item.modules || []).map((module) => (
                        <ListItemButton
                          key={module.id}
                          selected={module.id === activeModuleId}
                          onClick={() => onModuleSelect?.(module)}
                          sx={{ pl: 7, py: 0.75 }}
                        >
                          <ListItemText primary={<Typography variant="body2">{module.label}</Typography>} />
                        </ListItemButton>
                      ))}
                    </List>
                  </Collapse>
                )}
              </Box>
            );
          })}
        </List>
      </Box>
      {activePrimaryItem && activePrimaryItem.modules?.length > 0 && collapsed && (
        <Box sx={{ p: 2 }}>
          <Typography variant="caption" color="text.secondary">
            {activePrimaryItem.modules.length} modules
          </Typography>
        </Box>
      )}
    </Box>
  );
}
