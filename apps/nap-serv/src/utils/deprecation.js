'use strict';

/*
 * Simple deprecation tracker for legacy endpoints.
 * - Use deprecatedRoute({ category, target }) as middleware on legacy routers.
 * - It logs a standardized warning and increments an in-memory counter.
 * - Export getCounters() to inspect counts during runtime.
 */

const counters = new Map();

function increment(category) {
  const current = counters.get(category) || 0;
  counters.set(category, current + 1);
}

export function getCounters() {
  return Object.fromEntries(counters.entries());
}

export function deprecatedRoute({ category, target }) {
  return function deprecate(_req, _res, next) {
    increment(category);
    console.warn(
      `[DEPRECATION] Legacy endpoint in category '${category}' is now served by core. Please switch to ${target} (count=${counters.get(
        category,
      )})`,
    );
    next();
  };
}

export default { deprecatedRoute, getCounters };
