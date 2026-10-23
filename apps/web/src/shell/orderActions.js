/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @typedef {object} ScreenAction
 * @property {string} label
 * @property {() => void} onClick
 * @property {number} [priority] Higher is more important; the default is 0.
 * @property {boolean} [create] The screen's create action, always last.
 * @property {'primary'|'secondary'|'warning'|'inherit'} [color]
 */

/**
 * Put a screen's actions in I0001-R028 order: least important first, so the
 * most important sits next to the create action, which is always last.
 * Equal priorities keep the order given. Falsy entries are dropped, so a
 * caller can write `canWrite && {...}`.
 * @param {Array<ScreenAction|null|false|undefined>} actions
 * @returns {ScreenAction[]}
 */
export function orderActions(actions) {
  const present = actions.filter(Boolean);
  const others = present
    .filter(action => !action.create)
    .map((action, index) => ({ action, index }))
    .sort(
      (a, b) =>
        (a.action.priority ?? 0) - (b.action.priority ?? 0) || a.index - b.index
    )
    .map(entry => entry.action);
  return [...others, ...present.filter(action => action.create)];
}
