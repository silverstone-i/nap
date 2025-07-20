'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import BaseController from '../../../src/utils/BaseController.js';
import { db } from '../../../src/db/db.js';
import fs from 'fs';
import { writeFile } from '../../../src/utils/xlsUtils.js';
import logger from '../../../src/utils/logger.js';

class TemplateTasksController extends BaseController {
  constructor() {
    super('templateTasks');
  }

  async importXls(req, res) {
    try {
      const tenantCode = req.user?.tenant_code;
      const createdBy = req.user?.user_name || req.user?.email;
      const index = parseInt(req.body.index || '0', 10);
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Step 1: preload template_units into a lookup
      const units = await db('templateUnits', req.schema).findAll();
      const lookup = new Map(units.map(u => [`${u.name}|${u.version}`, u.id]));

      // Step 2: import and transform each row
      const result = await this.model(req.schema).importFromSpreadsheet(file.path, index, row => {
        const key = `${row.unit_name}|${row.version}`;
        const template_unit_id = lookup.get(key);
        if (!template_unit_id) {
          throw new Error(`No template_unit found for ${key}`);
        }

        // Remove unit_name and version from the final row
        const { unit_name, version, ...rest } = row;
        return {
          ...rest,
          template_unit_id,
          tenant_code: tenantCode,
          created_by: createdBy,
        };
      });

      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

  async exportXls(req, res) {
    try {
      const timestamp = Date.now();
      const filePath = `/tmp/template_tasks_${timestamp}.xlsx`;
      const where = req.body.where || [];
      const joinType = req.body.joinType || 'AND';
      const options = req.body.options || {};

      await db('exportTemplateTasks', req.schema).exportToSpreadsheet(filePath, where, joinType, options);

      res.download(filePath, `template_tasks_${timestamp}.xlsx`, err => {
        if (err) {
          logger.error(`Error sending file: ${err.message}`);
        }
        fs.unlink(filePath, err => {
          if (err) logger.error(`Failed to delete exported file: ${err.message}`);
        });
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
}

const instance = new TemplateTasksController();

export default instance;
export { TemplateTasksController };
