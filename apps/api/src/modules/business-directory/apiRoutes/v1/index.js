/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendData } from '../../../../framework/envelope.js';
import { requireCapability } from '../../../../capability/requireCapability.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import {
  archiveRecord,
  bulkArchive,
  bulkRestore,
  createRecord,
  getRecord,
  listRecords,
  restoreRecord,
  retryPortalAccess,
  revealTaxId,
  updateRecord,
} from '../../domain/records.js';
import {
  addAddress,
  addContactMethod,
  removeAddress,
  removeContactMethod,
  updateAddress,
  updateContactMethod,
} from '../../domain/details.js';
import {
  archiveLabel,
  createLabel,
  listLabels,
  renameLabel,
  restoreLabel,
} from '../../domain/labels.js';
import { directoryContext, sendDirectoryError } from './shared.js';

const READ = 'business-directory::directory::read';
const WRITE = 'business-directory::directory::write';
const LABELS = 'business-directory::labels::write';
const TAX_IDS_READ = 'business-directory::tax-ids::read';

/**
 * Wrap a handler: require a session and `capability` (I0005-R001), build the
 * directory context, and report failures through the error envelope.
 * @param {object} deps Route context (`admin`, `runtime`, `taxIdPolicy`).
 * @param {string} capability
 * @param {(context: object, request: import('express').Request, response: import('express').Response) => Promise<void>} handler
 * @returns {import('express').RequestHandler[]}
 */
function route(deps, capability, handler) {
  return [
    requireSession(),
    requireCapability(capability),
    async (request, response) => {
      try {
        const context = await directoryContext(request, deps);
        await handler(context, request, response);
      } catch (error) {
        sendDirectoryError(response, error);
      }
    },
  ];
}

/**
 * Build a record router for one collection (M0005 §10): list, view,
 * create, edit, archive, restore, and reveal a tax ID.
 * @param {string} name `people`, `organizations`, or `organization-contacts`.
 * @returns {(deps: object) => import('express').Router}
 */
function recordRouter(name) {
  return deps => {
    const router = Router();
    router.get(
      '/',
      ...route(deps, READ, async (context, request, response) =>
        sendData(response, await listRecords(context, name, request.query))
      )
    );
    router.get(
      '/:id',
      ...route(deps, READ, async (context, request, response) =>
        sendData(response, await getRecord(context, name, request.params.id))
      )
    );
    router.get(
      '/:id/tax-id',
      ...route(deps, TAX_IDS_READ, async (context, request, response) =>
        sendData(response, await revealTaxId(context, name, request.params.id))
      )
    );
    router.post(
      '/',
      ...route(deps, WRITE, async (context, request, response) =>
        sendData(response, await createRecord(context, name, request.body), 201)
      )
    );
    router.patch(
      '/:id',
      ...route(deps, WRITE, async (context, request, response) =>
        sendData(
          response,
          await updateRecord(context, name, request.params.id, request.body)
        )
      )
    );
    // M0005-R030: all-or-nothing bulk archive and restore.
    router.post(
      '/archive',
      ...route(deps, WRITE, async (context, request, response) =>
        sendData(response, await bulkArchive(context, name, request.body))
      )
    );
    router.post(
      '/restore',
      ...route(deps, WRITE, async (context, request, response) =>
        sendData(response, await bulkRestore(context, name, request.body))
      )
    );
    router.post(
      '/:id/archive',
      ...route(deps, WRITE, async (context, request, response) =>
        sendData(
          response,
          await archiveRecord(context, name, request.params.id, request.body)
        )
      )
    );
    router.post(
      '/:id/restore',
      ...route(deps, WRITE, async (context, request, response) =>
        sendData(
          response,
          await restoreRecord(context, name, request.params.id, request.body)
        )
      )
    );
    if (name !== 'organizations')
      router.post(
        '/:id/portal-access/retry',
        ...route(deps, WRITE, async (context, request, response) =>
          sendData(
            response,
            await retryPortalAccess(
              context,
              name,
              request.params.id,
              request.body
            )
          )
        )
      );
    return router;
  };
}

/**
 * Build the `parties` router: a record's emails, phones, and addresses.
 * @param {object} deps
 * @returns {import('express').Router}
 */
export function createPartiesRouter(deps) {
  const router = Router();
  router.post(
    '/:id/contact-methods',
    ...route(deps, WRITE, async (context, request, response) =>
      sendData(
        response,
        await addContactMethod(context, request.params.id, request.body),
        201
      )
    )
  );
  router.patch(
    '/:id/contact-methods/:methodId',
    ...route(deps, WRITE, async (context, request, response) =>
      sendData(
        response,
        await updateContactMethod(
          context,
          request.params.id,
          request.params.methodId,
          request.body
        )
      )
    )
  );
  router.delete(
    '/:id/contact-methods/:methodId',
    ...route(deps, WRITE, async (context, request, response) =>
      sendData(
        response,
        await removeContactMethod(
          context,
          request.params.id,
          request.params.methodId
        )
      )
    )
  );
  router.post(
    '/:id/addresses',
    ...route(deps, WRITE, async (context, request, response) =>
      sendData(
        response,
        await addAddress(context, request.params.id, request.body),
        201
      )
    )
  );
  router.patch(
    '/:id/addresses/:addressId',
    ...route(deps, WRITE, async (context, request, response) =>
      sendData(
        response,
        await updateAddress(
          context,
          request.params.id,
          request.params.addressId,
          request.body
        )
      )
    )
  );
  router.delete(
    '/:id/addresses/:addressId',
    ...route(deps, WRITE, async (context, request, response) =>
      sendData(
        response,
        await removeAddress(
          context,
          request.params.id,
          request.params.addressId
        )
      )
    )
  );
  return router;
}

/**
 * Build the `labels` router (M0005-R017).
 * @param {object} deps
 * @returns {import('express').Router}
 */
export function createLabelsRouter(deps) {
  const router = Router();
  router.get(
    '/',
    ...route(deps, READ, async (context, request, response) =>
      sendData(response, await listLabels(context, request.query))
    )
  );
  router.post(
    '/',
    ...route(deps, LABELS, async (context, request, response) =>
      sendData(response, await createLabel(context, request.body), 201)
    )
  );
  router.patch(
    '/:id',
    ...route(deps, LABELS, async (context, request, response) =>
      sendData(
        response,
        await renameLabel(context, request.params.id, request.body)
      )
    )
  );
  router.post(
    '/:id/archive',
    ...route(deps, LABELS, async (context, request, response) =>
      sendData(
        response,
        await archiveLabel(context, request.params.id, request.body)
      )
    )
  );
  router.post(
    '/:id/restore',
    ...route(deps, LABELS, async (context, request, response) =>
      sendData(
        response,
        await restoreLabel(context, request.params.id, request.body)
      )
    )
  );
  return router;
}

/**
 * Version 1 route registrations for `business-directory`, mounted at
 * `/api/business-directory/v1/<router>` against the selected tenant's cell.
 */
export const businessDirectoryRoutesV1 = [
  { router: 'people', factory: recordRouter('people') },
  { router: 'organizations', factory: recordRouter('organizations') },
  {
    router: 'organization-contacts',
    factory: recordRouter('organization-contacts'),
  },
  { router: 'parties', factory: createPartiesRouter },
  { router: 'labels', factory: createLabelsRouter },
].map(entry => ({
  module: 'business-directory',
  version: 1,
  database: 'cell',
  ...entry,
}));
