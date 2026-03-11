/**
 * @file Layout dimension tokens — centralises repeating layout values
 * @module nap-client/config/layoutTokens
 *
 * Structural layout presets consumed by components via sx or style props.
 * Visual tokens (borders, surfaces, radii) live in tokens.js and theme.js.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { typographyTokens, density } from './tokens.js';

export const SIDEBAR_WIDTH_OPEN = 242;
export const SIDEBAR_WIDTH_COLLAPSED = 110;
export const SIDEBAR_WIDTH_EXPANDED = SIDEBAR_WIDTH_OPEN;
export const TENANT_BAR_HEIGHT = 48;
export const MODULE_BAR_HEIGHT = 48;

/* ── Font tokens ──────────────────────────────────────────────── */

export const FONT = {
  navGroup: { fontSize: '0.8125rem', letterSpacing: '0.02em' },
  navItem: { fontSize: '0.8125rem' },
  toolbar: { fontSize: '0.8125rem' },
  toolbarAction: { fontSize: '0.8125rem' },
  breadcrumb: typographyTokens.breadcrumb,
  pageTitle: typographyTokens.pageTitle,
};

/* ── Composite sx presets ─────────────────────────────────────── */

export const sidebarPaperSx = (width) => ({
  width,
  transition: 'width 0.2s ease-in-out',
  overflowX: 'hidden',
  boxSizing: 'border-box',
  borderRight: 1,
  borderColor: 'divider',
});

export const tenantBarSx = {
  height: TENANT_BAR_HEIGHT,
  minHeight: TENANT_BAR_HEIGHT,
  bgcolor: 'background.paper',
  borderBottom: 1,
  borderColor: 'divider',
  boxShadow: 'none',
  color: 'text.primary',
};

export const moduleBarSx = {
  height: MODULE_BAR_HEIGHT,
  minHeight: MODULE_BAR_HEIGHT,
  bgcolor: 'background.paper',
  borderBottom: 1,
  borderColor: 'divider',
};

export const pageContainerSx = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  gap: `${density.sectionGap}px`,
};

export const formGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: `${density.fieldGap}px`,
};

export const formFullSpanSx = {
  gridColumn: '1 / -1',
};

export const formGroupCardSx = {
  gridColumn: '1 / -1',
  p: 2,
  border: 1,
  borderColor: 'divider',
  borderRadius: 1,
};

export const formSectionHeaderSx = {
  gridColumn: '1 / -1',
  mb: -1,
};

/* ── Dialog presets ──────────────────────────────────────────── */

export const dialogHeaderSx = {
  display: 'flex',
  alignItems: 'flex-start',
};

export const dialogActionBoxSx = {
  ml: 'auto',
};

/* ── Flex utilities ──────────────────────────────────────────── */

export const flexRowSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
};

export const flexBetweenSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

/* ── Detail / report presets ─────────────────────────────────── */

export const detailGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
  gap: 1.5,
};

export const chartContainerSx = {
  height: 300,
  mb: 3,
};

/* ── Master-detail split ─────────────────────────────────────── */

export const masterDetailSx = {
  display: 'flex',
  flexDirection: 'row',
  height: '100%',
  gap: `${density.sectionGap}px`,
};

export const masterPanelSx = {
  width: '38%',
  minWidth: 340,
  display: 'flex',
  flexDirection: 'column',
};

export const detailPanelSx = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'auto',
};
