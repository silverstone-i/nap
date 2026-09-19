/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  readFile,
  writeFile,
  rename,
  mkdir,
  rm,
  lstat,
  open,
} from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireCondition } from '../../application/shared/errors.js';
/**
 * Run `operation` with exclusive access to a private JSON state file.
 *
 * Takes a sibling `.lock` directory, rejects a state file readable by
 * others, and passes the parsed state (or `undefined`) with a `save`
 * function that writes atomically through a synced temp file and rename.
 * The lock is removed on exit; a stale one reports `STATE_LOCKED`.
 * @template T
 * @param {string} file
 * @param {(state: object | undefined, save: (value: object) => Promise<void>) => Promise<T>} operation
 * @returns {Promise<T>}
 * @throws {MaintenanceError} `STATE_LOCKED` or `UNSAFE_STATE_FILE`
 */
export async function withState(file, operation) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const lock = file + '.lock';
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch {
    requireCondition(false, 'STATE_LOCKED');
  }
  try {
    let state;
    try {
      const stat = await lstat(file);
      requireCondition(
        stat.isFile() && !(stat.mode & 0o077),
        'UNSAFE_STATE_FILE'
      );
      state = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const save = async value => {
      const temp = file + '.' + randomUUID();
      try {
        await writeFile(temp, JSON.stringify(value, null, 2) + '\n', {
          mode: 0o600,
          flag: 'wx',
        });
        const fd = await open(temp, 'r');
        try {
          await fd.sync();
        } finally {
          await fd.close();
        }
        await rename(temp, file);
      } finally {
        await rm(temp, { force: true });
      }
    };
    return await operation(state, save);
  } finally {
    await rm(lock, { recursive: true });
  }
}
