/**
 * @file Unit tests for template-based unit creation service
 * @module tests/unit/templateService
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockFindById = vi.fn();
const mockFindWhere = vi.fn();
const mockNone = vi.fn();

vi.mock('../../src/db/db.js', () => {
  const handler = {
    findById: (...args) => mockFindById(...args),
    findWhere: (...args) => mockFindWhere(...args),
    insert: (...args) => mockInsert(...args),
  };
  const proxy = (modelName, schema) => handler;
  proxy.none = (...args) => mockNone(...args);
  return { default: proxy, db: proxy };
});

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { instantiateFromTemplate } = await import(
  '../../Modules/projects/services/templateService.js'
);

describe('Template Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws if template unit not found', async () => {
    mockFindById.mockResolvedValueOnce(null);
    await expect(
      instantiateFromTemplate('test', 'unit-1', 'missing-template', null),
    ).rejects.toThrow('Template unit missing-template not found');
  });

  it('copies tasks preserving hierarchy and cost items', async () => {
    // Template unit found
    mockFindById.mockResolvedValueOnce({ id: 'tu1', version: 3 });

    // Template tasks
    mockFindWhere.mockResolvedValueOnce([
      { id: 'tt1', task_code: 'FRAME', name: 'Framing', duration_days: 5, parent_code: null, template_unit_id: 'tu1' },
      { id: 'tt2', task_code: 'DRYWALL', name: 'Drywall', duration_days: 3, parent_code: 'FRAME', template_unit_id: 'tu1' },
    ]);

    // Task inserts return sequential IDs
    let insertCount = 0;
    mockInsert.mockImplementation((data) => {
      insertCount++;
      return Promise.resolve({ id: `task-${insertCount}`, ...data });
    });

    // Template cost items
    mockFindWhere.mockResolvedValueOnce([
      {
        id: 'tci1', template_task_id: 'tt1', item_code: 'MAT1',
        description: 'Lumber', cost_class: 'material', cost_source: 'budget',
        quantity: '100', unit_cost: '5.00',
      },
    ]);

    // Template change orders
    mockFindWhere.mockResolvedValueOnce([
      { id: 'tco1', template_unit_id: 'tu1', co_number: 'CO-001', title: 'Extra work', reason: 'Scope change', total_amount: '1000.00' },
    ]);

    await instantiateFromTemplate('test', 'unit-1', 'tu1', 'user-1');

    // Verify template_unit_id and version_used were set on the unit
    expect(mockNone).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE test.units SET template_unit_id'),
      ['tu1', 3, 'unit-1'],
    );

    // Two tasks created + one cost item + one change order
    expect(mockInsert).toHaveBeenCalledTimes(4);

    // Verify parent_task_id resolution (second task's parent_code = FRAME → task-1)
    expect(mockNone).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE test.tasks SET parent_task_id'),
      ['task-1', 'task-2'],
    );
  });

  it('handles empty template (no tasks)', async () => {
    mockFindById.mockResolvedValueOnce({ id: 'tu1', version: 1 });
    mockFindWhere.mockResolvedValueOnce([]); // no template tasks

    await instantiateFromTemplate('test', 'unit-1', 'tu1', null);

    // Only the version update should happen, no task inserts
    expect(mockNone).toHaveBeenCalledTimes(1); // just the unit update
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
