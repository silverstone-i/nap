/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendData, sendNoContent } from '../../../../framework/envelope.js';
import {
  requireCapability,
  sessionOnly,
} from '../../../../capability/requireCapability.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import {
  getEffective,
  getGeneral,
  updateGeneral,
} from '../../domain/general.js';
import { deleteLogo, fileLink, putLogo } from '../../domain/files.js';
import {
  deleteProfileImage,
  getProfile,
  putProfileImage,
  updateProfile,
} from '../../domain/profile.js';
import {
  deleteStorage,
  getStorage,
  saveStorage,
} from '../../domain/storage.js';
import { sendSettingsError, settingsContext } from './shared.js';
import { uploadedFile } from './upload.js';

const READ = 'tenant-settings::general::read';
const WRITE = 'tenant-settings::general::write';
const STORAGE_READ = 'tenant-settings::storage::read';
const STORAGE_WRITE = 'tenant-settings::storage::write';

/**
 * Wrap a handler: build the settings context and report failures through
 * the error envelope.
 * @param {object} deps Route context (`runtime`).
 * @param {(context: object, request: import('express').Request, response: import('express').Response) => Promise<void>} handler
 * @returns {import('express').RequestHandler}
 */
function handle(deps, handler) {
  return async (request, response) => {
    try {
      const context = await settingsContext(request, deps);
      await handler(context, request, response);
    } catch (error) {
      sendSettingsError(response, error);
    }
  };
}

/**
 * Build the `general` router (M0006-01-R005–R007).
 * @param {object} deps
 * @returns {import('express').Router}
 */
export function createGeneralRouter(deps) {
  const router = Router();
  router.get(
    '/',
    requireSession(),
    requireCapability(READ),
    handle(deps, async (context, request, response) =>
      sendData(response, await getGeneral(context, request.query))
    )
  );
  router.patch(
    '/',
    requireSession(),
    requireCapability(WRITE),
    handle(deps, async (context, request, response) =>
      sendData(response, await updateGeneral(context, request.body))
    )
  );
  return router;
}

/**
 * Build the `effective` router (M0006-01-R008): any member of the selected
 * tenant reads the values to apply.
 * @param {object} deps
 * @returns {import('express').Router}
 */
export function createEffectiveRouter(deps) {
  const router = Router();
  router.get(
    '/',
    requireSession(),
    sessionOnly,
    handle(deps, async (context, request, response) =>
      sendData(response, await getEffective(context, request.query))
    )
  );
  return router;
}

/**
 * Build the `storage` router (M0006-02-R001–R006, R015).
 * @param {object} deps
 * @returns {import('express').Router}
 */
export function createStorageRouter(deps) {
  const router = Router();
  router.get(
    '/',
    requireSession(),
    requireCapability(STORAGE_READ),
    handle(deps, async (context, request, response) =>
      sendData(response, await getStorage(context, request.query))
    )
  );
  router.put(
    '/',
    requireSession(),
    requireCapability(STORAGE_WRITE),
    handle(deps, async (context, request, response) =>
      sendData(response, await saveStorage(context, request.body))
    )
  );
  router.delete(
    '/',
    requireSession(),
    requireCapability(STORAGE_WRITE),
    handle(deps, async (context, request, response) => {
      await deleteStorage(context, request.query);
      sendNoContent(response);
    })
  );
  return router;
}

/**
 * Build the `logo` router (M0006-02-R013). It takes the image as
 * `multipart/form-data`, so it is registered for uploads.
 * @param {object} deps
 * @returns {import('express').Router}
 */
export function createLogoRouter(deps) {
  const router = Router();
  router.put(
    '/',
    requireSession(),
    requireCapability(WRITE),
    uploadedFile(),
    handle(deps, async (context, request, response) =>
      sendData(response, await putLogo(context, request.upload))
    )
  );
  router.delete(
    '/',
    requireSession(),
    requireCapability(WRITE),
    handle(deps, async (context, _request, response) => {
      await deleteLogo(context);
      sendNoContent(response);
    })
  );
  return router;
}

/**
 * Build the `files` router (M0006-02-R010): any member of the selected
 * tenant gets a signed link to one of its files.
 * @param {object} deps
 * @returns {import('express').Router}
 */
export function createFilesRouter(deps) {
  const router = Router();
  router.get(
    '/:id/link',
    requireSession(),
    sessionOnly,
    handle(deps, async (context, request, response) =>
      sendData(response, await fileLink(context, request.params, request.query))
    )
  );
  return router;
}

/**
 * Build the `profile` router (M0006-03 §10): the signed-in member's own
 * profile in the selected tenant. No route takes a member ID; the member
 * comes from the session (§7). Only `PUT /image` takes an upload.
 * @param {object} deps
 * @returns {import('express').Router}
 */
export function createProfileRouter(deps) {
  const router = Router();
  router.get(
    '/',
    requireSession(),
    sessionOnly,
    handle(deps, async (context, request, response) =>
      sendData(response, await getProfile(context, request.query))
    )
  );
  router.patch(
    '/',
    requireSession(),
    sessionOnly,
    handle(deps, async (context, request, response) =>
      sendData(response, await updateProfile(context, request.body))
    )
  );
  router.put(
    '/image',
    requireSession(),
    sessionOnly,
    uploadedFile(),
    handle(deps, async (context, request, response) =>
      sendData(response, await putProfileImage(context, request.upload))
    )
  );
  router.delete(
    '/image',
    requireSession(),
    sessionOnly,
    handle(deps, async (context, _request, response) =>
      sendData(response, await deleteProfileImage(context))
    )
  );
  return router;
}

/**
 * Version 1 route registrations for `tenant-settings`, mounted at
 * `/api/tenant-settings/v1/<router>` against the selected tenant's cell.
 */
export const tenantSettingsRoutesV1 = [
  { router: 'general', factory: createGeneralRouter },
  { router: 'effective', factory: createEffectiveRouter },
  { router: 'storage', factory: createStorageRouter },
  { router: 'logo', factory: createLogoRouter, uploads: true },
  { router: 'files', factory: createFilesRouter },
  { router: 'profile', factory: createProfileRouter, uploads: ['/image'] },
].map(entry => ({
  module: 'tenant-settings',
  version: 1,
  database: 'cell',
  ...entry,
}));
