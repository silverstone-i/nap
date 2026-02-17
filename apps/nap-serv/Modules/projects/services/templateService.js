/**
 * @file Template service — copies template tasks and cost items into a new unit
 * @module projects/services/templateService
 *
 * Given a template_unit_id, copies all template_tasks and template_cost_items
 * into real tasks and cost_items under the target unit. Preserves task hierarchy
 * by resolving parent_code references to parent_task_id after creation.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../src/db/db.js';
import logger from '../../../src/utils/logger.js';

/**
 * Instantiate a unit from a template — copies tasks, cost items, and change orders.
 *
 * @param {string} schema Tenant schema name
 * @param {string} unitId The newly created unit's ID
 * @param {string} templateUnitId Source template unit ID
 * @param {string|null} createdBy User ID for audit fields
 */
export async function instantiateFromTemplate(schema, unitId, templateUnitId, createdBy = null) {
  // Fetch the template unit to record version
  const templateUnit = await db('templateUnits', schema).findById(templateUnitId);
  if (!templateUnit) {
    throw new Error(`Template unit ${templateUnitId} not found`);
  }

  // Record template reference on the unit
  await db.none(
    `UPDATE ${schema}.units SET template_unit_id = $1, version_used = $2 WHERE id = $3`,
    [templateUnitId, templateUnit.version, unitId],
  );

  // Fetch template tasks
  const templateTasks = await db('templateTasks', schema).findWhere(
    [{ template_unit_id: templateUnitId }],
    'AND',
  );

  if (!templateTasks.length) {
    logger.info(`No template tasks found for template_unit_id=${templateUnitId}`);
    return;
  }

  // Pass 1: Create all tasks, building a code→id map
  const codeToTaskId = new Map();
  for (const tt of templateTasks) {
    const task = await db('tasks', schema).insert({
      unit_id: unitId,
      task_code: tt.task_code,
      name: tt.name,
      duration_days: tt.duration_days,
      status: 'pending',
      created_by: createdBy,
    });
    codeToTaskId.set(tt.task_code, task.id);
  }

  // Pass 2: Resolve parent_code → parent_task_id
  for (const tt of templateTasks) {
    if (tt.parent_code && codeToTaskId.has(tt.parent_code)) {
      const taskId = codeToTaskId.get(tt.task_code);
      const parentTaskId = codeToTaskId.get(tt.parent_code);
      await db.none(
        `UPDATE ${schema}.tasks SET parent_task_id = $1 WHERE id = $2`,
        [parentTaskId, taskId],
      );
    }
  }

  // Copy template cost items for each task
  const templateCostItems = await db('templateCostItems', schema).findWhere(
    [{ template_task_id: { $in: templateTasks.map((t) => t.id) } }],
    'AND',
  );

  // Build template_task_id → task_code map for lookup
  const templateTaskIdToCode = new Map(templateTasks.map((t) => [t.id, t.task_code]));

  for (const tci of templateCostItems) {
    const taskCode = templateTaskIdToCode.get(tci.template_task_id);
    const taskId = taskCode ? codeToTaskId.get(taskCode) : null;
    if (!taskId) continue;

    await db('costItems', schema).insert({
      task_id: taskId,
      item_code: tci.item_code,
      description: tci.description,
      cost_class: tci.cost_class,
      cost_source: tci.cost_source,
      quantity: tci.quantity,
      unit_cost: tci.unit_cost,
      created_by: createdBy,
    });
  }

  // Copy template change orders
  const templateCOs = await db('templateChangeOrders', schema).findWhere(
    [{ template_unit_id: templateUnitId }],
    'AND',
  );

  for (const tco of templateCOs) {
    await db('changeOrders', schema).insert({
      unit_id: unitId,
      co_number: tco.co_number,
      title: tco.title,
      reason: tco.reason,
      total_amount: tco.total_amount,
      status: 'draft',
      created_by: createdBy,
    });
  }

  logger.info(
    `Template instantiation complete: ${templateTasks.length} tasks, ${templateCostItems.length} cost items, ${templateCOs.length} change orders copied to unit ${unitId}`,
  );
}
