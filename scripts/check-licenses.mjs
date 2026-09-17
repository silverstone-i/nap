/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { init } from 'license-checker-rseidelsohn';

/**
 * Select package IDs that checkLicenses must reject against the supplied allowlist.
 * Missing, empty, unknown, and guessed licenses fail closed so absent or uncertain
 * evidence cannot count as license approval. License expressions
 * are compared as reported; this helper does not interpret SPDX alternatives.
 * Neither the package inventory nor the allowlist is mutated.
 */
export function rejectedLicenses(packages, allowed) {
  return Object.entries(packages)
    .filter(([, entry]) => {
      const licenses = Array.isArray(entry.licenses)
        ? entry.licenses
        : [entry.licenses];
      return (
        licenses.length === 0 ||
        licenses.some(license => !allowed.includes(license))
      );
    })
    .map(([name]) => name);
}

/**
 * Implement the npm licenses gate for local checks and CI by auditing installed
 * production packages against the repository's allowlist. Compare installed
 * versions with the lockfile so approval applies to the expected dependency set.
 * Reads the installation; does not install or change dependencies.
 * @param {URL} root Repository directory URL, with a trailing slash. It must
 * contain the manifests, npm lockfile, allowlist, and installed dependencies.
 * @returns {Promise<number>} Number of distinct name/version package records
 * checked, including local workspaces and installed optional production packages.
 * @throws If files cannot be read, scanning fails, an installed version differs
 * from the lockfile, a required package is absent, or a license is unapproved.
 */
export async function checkLicenses(root = new URL('../', import.meta.url)) {
  const { allowed } = JSON.parse(
    readFileSync(new URL('.licenses-allowed.json', root), 'utf8')
  );
  const lock = JSON.parse(
    readFileSync(new URL('package-lock.json', root), 'utf8')
  );
  // The checker's production traversal drops hoisted workspace dependencies.
  // Scan the complete installed inventory, then select npm's locked production set.
  const inventory = await new Promise((resolve, reject) =>
    init(
      {
        start: fileURLToPath(root),
        unknown: true,
      },
      (error, result) => (error ? reject(error) : resolve(result))
    )
  );
  const production = {};
  const firstParty = new Set(['', 'apps/api', 'apps/web', 'packages/shared']);
  for (const [location, entry] of Object.entries(lock.packages)) {
    // Workspace links are represented by their target entries in the lockfile;
    // skipping links avoids counting the same local package a second time.
    if (entry.dev || entry.link) continue;
    const manifestPath = new URL(
      `${location ? location + '/' : ''}package.json`,
      root
    );
    if (!existsSync(manifestPath)) {
      if (entry.optional) continue; // Platform-specific optional packages may be absent.
      throw new Error(`Missing installed production package: ${location}`);
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const name = `${manifest.name}@${manifest.version}`;
    if (entry.version && entry.version !== manifest.version)
      throw new Error(`Installed package differs from lockfile: ${name}`);
    if (!inventory[name])
      throw new Error(`License inventory omitted production package: ${name}`);
    // The checker labels private packages UNLICENSED even with an explicit license.
    // Only our exact workspace paths use the authoritative local manifest instead.
    production[name] = firstParty.has(location)
      ? { licenses: manifest.license }
      : inventory[name];
  }
  const failures = rejectedLicenses(production, allowed);
  if (failures.length)
    throw new Error(
      `Unapproved or unknown production licenses: ${failures.sort().join(', ')}`
    );
  const count = Object.keys(production).length;
  return count;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(
      `Production license check passed (${await checkLicenses()} package records)`
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Production license check failed'
    );
    process.exitCode = 1;
  }
}
