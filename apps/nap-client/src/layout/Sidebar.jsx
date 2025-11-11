import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Collapse,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Tooltip,
  Typography,
  Popper,
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
  const [flyout, setFlyout] = useState({ anchorEl: null, primary: null });
  const closeTimerRef = useRef(null);

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleCloseFlyout = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setFlyout({ anchorEl: null, primary: null });
    }, 180);
  };

  const openFlyout = (anchorEl, primary) => {
    if (!primary?.modules?.length) {
      setFlyout({ anchorEl: null, primary: null });
      return;
    }
    clearCloseTimer();
    setFlyout({ anchorEl, primary });
  };

  const handlePrimaryMouseEnter = (event, item) => {
    if (!collapsed) return;
    openFlyout(event.currentTarget, item);
  };

  const handlePrimaryMouseLeave = () => {
    if (!collapsed) return;
    scheduleCloseFlyout();
  };

  useEffect(() => {
    if (!collapsed) {
      setFlyout({ anchorEl: null, primary: null });
      clearCloseTimer();
    }
    return () => {
      clearCloseTimer();
    };
  }, [collapsed]);

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
                <Tooltip
                  title={collapsed && flyout.primary?.id !== item.id ? item.label : ''}
                  placement="right"
                  disableInteractive
                >
                  <ListItemButton
                    selected={isActive}
                    onClick={() => onPrimarySelect?.(item)}
                    onMouseEnter={(event) => handlePrimaryMouseEnter(event, item)}
                    onMouseLeave={handlePrimaryMouseLeave}
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
      <Popper
        open={collapsed && Boolean(flyout.anchorEl && flyout.primary)}
        anchorEl={flyout.anchorEl}
        placement="right-start"
        modifiers={[{ name: 'offset', options: { offset: [0, -16] } }]}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleCloseFlyout}
        sx={{ zIndex: (theme) => theme.zIndex.tooltip + 1 }}
      >
        <Paper elevation={4} sx={{ minWidth: 200 }}>
          <List dense>
            {(flyout.primary?.modules || []).map((module) => (
              <ListItemButton
                key={module.id}
                selected={module.id === activeModuleId}
                onClick={() => {
                  onModuleSelect?.(module);
                  setFlyout({ anchorEl: null, primary: null });
                }}
              >
                <ListItemText primary={<Typography variant="body2">{module.label}</Typography>} />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      </Popper>
    </Box>
  );
}
