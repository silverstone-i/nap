/**
 * @file Views API methods — read-only export view endpoints
 * @module nap-client/services/viewApi
 *
 * Base path: /views/v1/*
 * All endpoints are GET-only.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { client } from './client.js';

export const viewApi = {
  /** GET /contacts — flattened contact export view. */
  contacts: () => client.get('/views/v1/contacts'),

  /** GET /addresses — flattened address export view. */
  addresses: () => client.get('/views/v1/addresses'),

  /** GET /template-cost-items — template cost items export view. */
  templateCostItems: () => client.get('/views/v1/template-cost-items'),

  /** GET /template-tasks — template tasks export view. */
  templateTasks: () => client.get('/views/v1/template-tasks'),
};

export default viewApi;
