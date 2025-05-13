'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/



const allowedTransitions = {
  draft: ['submitted'],
  submitted: ['approved'],
  approved: ['locked'],
  locked: [],
};

/**
 * Validates if a budget status transition is allowed.
 * @param {string} current - The current budget_status.
 * @param {string} next - The desired new budget_status.
 * @throws {Error} If the transition is invalid.
 */
export function validateStatusTransition(current, next) {
  const allowed = allowedTransitions[current] || [];
  if (!allowed.includes(next)) {
    throw new Error(`Invalid status transition from '${current}' to '${next}'`);
  }
}

/**
 * Ensures the budget is in a specific status before performing an action.
 * @param {string} actual - The current budget_status.
 * @param {string[]} allowedStatuses - Allowed statuses for the action.
 * @param {string} action - Name of the attempted action.
 * @throws {Error} If the budget_status is not permitted for the action.
 */
export function assertStatusAllowed(actual, allowedStatuses, action) {
  if (!allowedStatuses.includes(actual)) {
    throw new Error(`Cannot ${action} when budget_status is '${actual}'`);
  }
}