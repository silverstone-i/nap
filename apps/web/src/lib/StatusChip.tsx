/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Chip from '@mui/material/Chip';
import type { InvoiceStatus, ProjectStatus } from '../mocks/types';

/**
 * Status badge pairing shape with color per BRAND.md's icon vocabulary
 * (✓ success, ▲ warning, i info, ◇ neutral/draft) — color alone is never
 * sufficient (WCAG 1.4.1).
 */

type ChipColor = 'success' | 'warning' | 'info' | 'default';

const invoiceStatus: Record<InvoiceStatus, [string, string, ChipColor]> = {
  draft: ['◇', 'Draft', 'default'],
  'pending-approval': ['▲', 'Pending approval', 'warning'],
  approved: ['i', 'Approved', 'info'],
  paid: ['✓', 'Paid', 'success'],
};

const projectStatus: Record<ProjectStatus, [string, string, ChipColor]> = {
  active: ['i', 'Active', 'info'],
  'on-hold': ['▲', 'On hold', 'warning'],
  closed: ['✓', 'Closed', 'default'],
};

export function InvoiceStatusChip({ status }: { status: InvoiceStatus }) {
  const [glyph, label, color] = invoiceStatus[status];
  return (
    <Chip
      size="small"
      variant="outlined"
      color={color}
      label={`${glyph} ${label}`}
    />
  );
}

export function ProjectStatusChip({ status }: { status: ProjectStatus }) {
  const [glyph, label, color] = projectStatus[status];
  return (
    <Chip
      size="small"
      variant="outlined"
      color={color}
      label={`${glyph} ${label}`}
    />
  );
}
