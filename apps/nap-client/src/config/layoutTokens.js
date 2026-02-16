/**
 * @file Layout design tokens — shared constants for layout chrome dimensions and styling
 * @module nap-client/config/layoutTokens
 *
 * Single source of truth for sidebar widths, bar heights, spacing,
 * border treatments, and typography presets used across layout components.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/* ── Dimensions ─────────────────────────────────────────────── */

export const SIDEBAR_WIDTH_EXPANDED = 242;
export const SIDEBAR_WIDTH_COLLAPSED = 110;

export const TENANT_BAR_HEIGHT = 48;
export const MODULE_BAR_HEIGHT = 42;

/* ── Borders ────────────────────────────────────────────────── */

export const BORDER = { borderWidth: 1, borderStyle: 'solid', borderColor: 'divider' };

/** Shorthand sx prop for a bottom border. */
export const borderBottom = { borderBottom: 1, borderColor: 'divider' };

/** Shorthand sx prop for a right border. */
export const borderRight = { borderRight: 1, borderColor: 'divider' };

/* ── Transitions ────────────────────────────────────────────── */

export const SIDEBAR_TRANSITION = 'width 0.2s ease';

/* ── Typography presets ─────────────────────────────────────── */

export const FONT = {
  navGroup: { fontSize: '0.85rem' },
  navItem: { fontSize: '0.8rem' },
  toolbar: { fontSize: '0.85rem' },
  toolbarAction: { fontSize: '0.8rem' },
  caption: { fontSize: '0.75rem' },
};

/* ── Component token sets (for sx spread) ───────────────────── */

/** TenantBar root sx — visual props (border, elevation) handled by theme overrides. */
export const tenantBarSx = {
  bgcolor: 'background.header',
  height: TENANT_BAR_HEIGHT,
};

/** ModuleBar root sx — structural positioning (Box, not a themed MUI component). */
export const moduleBarSx = {
  position: 'sticky',
  top: TENANT_BAR_HEIGHT,
  bgcolor: 'background.surface',
  ...borderBottom,
  minHeight: MODULE_BAR_HEIGHT,
};

/** Sidebar drawer paper sx — visual props (bgcolor, border, overflow) handled by theme. */
export const sidebarPaperSx = (width) => ({
  width,
  transition: SIDEBAR_TRANSITION,
});

/* ── Page containers ────────────────────────────────────────── */

/** Full-height flex column — standard page wrapper for DataGrid pages. */
export const pageContainerSx = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
};

/* ── Form layout ───────────────────────────────────────────── */

/** Two-column grid for form sections inside dialogs. */
export const formGridSx = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 2,
};

/** Single element spanning full width of a formGridSx container. */
export const formFullSpanSx = { gridColumn: '1 / -1' };

/** Bordered card for repeatable address/phone groups inside forms. */
export const formGroupCardSx = {
  ...formGridSx,
  p: 2,
  border: 1,
  borderColor: 'divider',
  borderRadius: 1,
  position: 'relative',
};

/** Row with space-between for section header + add button. */
export const formSectionHeaderSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

/* ── Convenience exports ────────────────────────────────────── */

const layoutTokens = {
  SIDEBAR_WIDTH_EXPANDED,
  SIDEBAR_WIDTH_COLLAPSED,
  TENANT_BAR_HEIGHT,
  MODULE_BAR_HEIGHT,
  BORDER,
  borderBottom,
  borderRight,
  SIDEBAR_TRANSITION,
  FONT,
  tenantBarSx,
  moduleBarSx,
  sidebarPaperSx,
  pageContainerSx,
  formGridSx,
  formFullSpanSx,
  formGroupCardSx,
  formSectionHeaderSx,
};

export default layoutTokens;
