/**
 * @file Detect circular dependencies at the module level
 * @module scripts/arch/checkCircularDeps
 */

import { join } from 'node:path';
import { SRC, walkJs, scanFile } from './lib/fileScanner.js';
import { moduleOf, resolveImport } from './lib/moduleResolver.js';

/**
 * Build a module-level dependency graph and detect cycles via DFS.
 * @returns {{ name: string, pass: boolean, summary: string, violations: string[], details: object, graph: object }}
 */
export default function checkCircularDeps() {
  // Build adjacency list: module → Set<module>
  const graph = {};
  const modulesDir = join(SRC, 'modules');
  const systemDir = join(SRC, 'system');
  const files = [...walkJs(modulesDir), ...walkJs(systemDir)];

  for (const filePath of files) {
    const homeModule = moduleOf(filePath);
    if (!homeModule) continue;
    if (!graph[homeModule]) graph[homeModule] = new Set();

    const { imports } = scanFile(filePath);
    for (const spec of imports) {
      if (!spec.startsWith('.')) continue;
      const { targetModule } = resolveImport(spec, filePath);
      if (targetModule && targetModule !== homeModule) {
        graph[homeModule].add(targetModule);
      }
    }
  }

  // Convert Sets to arrays for serialization
  const graphJson = {};
  for (const [mod, deps] of Object.entries(graph)) {
    graphJson[mod] = [...deps].sort();
  }

  // DFS cycle detection
  const cycles = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = {};

  for (const mod of Object.keys(graph)) color[mod] = WHITE;

  function dfs(u, path) {
    color[u] = GRAY;
    path.push(u);

    for (const v of graph[u] || []) {
      if (color[v] === GRAY) {
        // Back edge → cycle found. Extract cycle from path.
        const cycleStart = path.indexOf(v);
        const cycle = [...path.slice(cycleStart), v];
        cycles.push(cycle);
      } else if (color[v] === WHITE) {
        dfs(v, path);
      }
    }

    path.pop();
    color[u] = BLACK;
  }

  for (const mod of Object.keys(graph)) {
    if (color[mod] === WHITE) {
      dfs(mod, []);
    }
  }

  const pass = cycles.length === 0;

  return {
    name: 'Circular Dependency Detection',
    pass,
    summary: pass
      ? `No circular dependencies among ${Object.keys(graph).length} modules.`
      : `${cycles.length} circular dependency chain(s) detected.`,
    violations: cycles.map((c) => c.join(' → ')),
    details: { moduleCount: Object.keys(graph).length, cycles },
    graph: graphJson,
  };
}
