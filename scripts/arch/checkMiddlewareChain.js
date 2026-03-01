/**
 * @file Check that all routers include moduleEntitlement middleware
 * @module scripts/arch/checkMiddlewareChain
 *
 * Classification:
 *   - createRouter users → standard routes auto-covered (ensureEntitlement)
 *   - Hand-built routers → each router.verb() must reference moduleEntitlement
 *   - system/auth/ → exempt (pre-authentication routes)
 *   - /ping routes → exempt
 */

import { join, relative } from 'node:path';
import { readFileSync } from 'node:fs';
import { SRC, walkJs } from './lib/fileScanner.js';

/** Modules whose routers are exempt from moduleEntitlement (pre-auth, admin-only, etc.) */
const EXEMPT_MODULES = new Set(['auth', 'tenants']);

/**
 * Scan all router files and verify moduleEntitlement presence.
 * @returns {{ name: string, pass: boolean, summary: string, violations: string[], details: object }}
 */
export default function checkMiddlewareChain() {
  // Only scan routers in modules/ and system/ — skip lib/createRouter.js (the factory)
  const routerFiles = [
    ...walkJs(join(SRC, 'modules')),
    ...walkJs(join(SRC, 'system')),
  ].filter((f) => f.endsWith('Router.js'));
  const results = [];
  const violations = [];

  for (const filePath of routerFiles) {
    const rel = relative(SRC, filePath);
    const source = readFileSync(filePath, 'utf8');

    // Check module exemption
    const parts = rel.split('/');
    const modName = parts[0] === 'system' || parts[0] === 'modules' ? parts[1] : null;
    if (modName && EXEMPT_MODULES.has(modName)) {
      results.push({ file: rel, type: 'exempt', routes: [] });
      continue;
    }

    const usesCreateRouter = /import\s+createRouter\s+from/.test(source);

    if (usesCreateRouter) {
      // Standard routes are auto-covered. Check extendRoutes callbacks for hand-built routes.
      const handBuiltRoutes = extractRouteRegistrations(source);
      const missing = handBuiltRoutes.filter((r) => !r.hasEntitlement && !isPing(r.path));

      results.push({
        file: rel,
        type: missing.length > 0 ? 'hybrid' : 'createRouter',
        routes: handBuiltRoutes,
      });

      for (const r of missing) {
        violations.push({
          file: rel,
          method: r.method,
          path: r.path,
          reason: 'extendRoutes callback route missing moduleEntitlement',
        });
      }
    } else {
      // Fully hand-built router — check every route registration
      const routes = extractRouteRegistrations(source);
      const missing = routes.filter((r) => !r.hasEntitlement && !isPing(r.path));

      results.push({ file: rel, type: 'manual', routes });

      for (const r of missing) {
        violations.push({
          file: rel,
          method: r.method,
          path: r.path,
          reason: 'hand-built route missing moduleEntitlement',
        });
      }
    }
  }

  const pass = violations.length === 0;

  return {
    name: 'Middleware Chain Integrity',
    pass,
    summary: pass
      ? `${routerFiles.length} router files checked — all include moduleEntitlement.`
      : `${violations.length} route(s) missing moduleEntitlement.`,
    violations: violations.map((v) => `${v.file}: ${v.method.toUpperCase()} ${v.path} — ${v.reason}`),
    details: {
      routerCount: routerFiles.length,
      exempt: results.filter((r) => r.type === 'exempt').map((r) => r.file),
      createRouter: results.filter((r) => r.type === 'createRouter').map((r) => r.file),
      hybrid: results.filter((r) => r.type === 'hybrid').map((r) => r.file),
      manual: results.filter((r) => r.type === 'manual').map((r) => r.file),
      violations,
    },
  };
}

/**
 * Extract router.get/post/put/delete/patch() calls from source text.
 * @param {string} source
 * @returns {{ method: string, path: string, hasEntitlement: boolean }[]}
 */
function extractRouteRegistrations(source) {
  const results = [];
  // Match: router.verb('path', ...middleware..., handler)
  // Captures the method, the path string, and the rest of the arguments line
  const re = /router\.(get|post|put|delete|patch)\(\s*['"]([^'"]*)['"]([\s\S]*?)\)\s*;/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const method = m[1];
    const path = m[2];
    const argsRest = m[3];
    const hasEntitlement = argsRest.includes('moduleEntitlement');
    results.push({ method, path, hasEntitlement });
  }
  return results;
}

/**
 * Check if a route path is a /ping health check.
 * @param {string} path
 * @returns {boolean}
 */
function isPing(path) {
  return path === '/ping';
}
