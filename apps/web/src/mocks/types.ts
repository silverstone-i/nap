/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export interface Entity {
  id: string;
  code: string;
  name: string;
}

export type ProjectStatus = 'active' | 'on-hold' | 'closed';

export interface CostLine {
  costCode: string;
  description: string;
  budget: number;
  committed: number;
  actual: number;
}

export interface Project {
  id: string;
  entityId: string;
  code: string;
  name: string;
  status: ProjectStatus;
  manager: string;
  startDate: string;
  budget: number;
  committed: number;
  actual: number;
  lines: CostLine[];
}

export type InvoiceStatus = 'draft' | 'pending-approval' | 'approved' | 'paid';

export interface InvoiceLine {
  id: string;
  costCode: string;
  description: string;
  amount: number;
}

export interface Invoice {
  id: string;
  entityId: string;
  projectId: string;
  number: string;
  vendor: string;
  issuedDate: string;
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
  lines: InvoiceLine[];
}

export interface InboxItem {
  id: string;
  entityId: string;
  projectId?: string;
  type: 'approval' | 'task';
  title: string;
  detail: string;
  due?: string;
  ref: { kind: 'invoice'; id: string } | { kind: 'project'; id: string };
}
