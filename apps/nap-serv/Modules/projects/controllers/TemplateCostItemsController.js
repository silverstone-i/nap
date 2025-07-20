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
import db, { DB } from '../../../src/db/db.js';
import ExcelJS from 'exceljs';
import fs from 'fs';
import { writeFile } from '../../../src/utils/xlsUtils.js';
import logger from '../../../src/utils/logger.js';

class TemplateCostItemsController extends BaseController {
  constructor() {
    super('templateCostItems');
  }

  async importXls(req, res) {
    try {
      const tenantCode = req.user?.tenant_code;
      const createdBy = req.user?.user_name || req.user?.email;
      const index = parseInt(req.body.index || '0', 10);
      const file = req.file;
      const schema = req.schema;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Step 1: Parse spreadsheet rows
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(file.path);
      const worksheet = workbook.worksheets[index];

      if (!worksheet) {
        return res.status(400).json({ error: `Sheet at index ${index} not found` });
      }

      const rows = [];
      const headerRow = worksheet.getRow(1).values.slice(1); // skip first empty cell

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const rowData = {};
        row.eachCell((cell, colNumber) => {
          const key = headerRow[colNumber - 1];
          rowData[key] = cell.value;
        });
        rows.push(rowData);
      });

      const keys = rows.map(r => `${r.unit_name}|${r.unit_version}|${r.task_code}`);
      const uniqueKeys = [...new Set(keys)];

      const conditions = [];
      const values = [];

      uniqueKeys.forEach((key, i) => {
        const [unit_name, unit_version, task_code] = key.split('|');
        conditions.push(`(u.name = $${values.length + 1} AND u.version = $${values.length + 2} AND t.task_code = $${values.length + 3})`);
        values.push(unit_name, unit_version, task_code);
      });

      const query = `
        SELECT t.id AS task_id, t.task_code, u.name, u.version
        FROM ${schema}.template_tasks t
        JOIN ${schema}.template_units u ON t.template_unit_id = u.id
        WHERE ${conditions.join(' OR ')}
      `;

      const taskRecords = await db.any(query, values);

      const taskMap = new Map(taskRecords.map(r => [`${r.name}|${r.version}|${r.task_code}`, r.task_id]));

      // Step 3: Import with transformed rows
      const result = await this.model(schema).importFromSpreadsheet(file.path, index, row => {
        const key = `${row.unit_name}|${row.unit_version}|${row.task_code}`;
        const template_task_id = taskMap.get(key);
        if (!template_task_id) {
          throw new Error(`No template_task found for ${key}`);
        }

        const { unit_name, unit_version, task_code, ...rest } = row;
        return {
          ...rest,
          template_task_id,
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
      const timestamp = Date.now();
      const filePath = `/tmp/template_cost_items_${timestamp}.xlsx`;
      const where = req.body.where || [];
      const joinType = req.body.joinType || 'AND';
      const options = req.body.options || {};

      await db('exportTemplateCostItems', req.schema).exportToSpreadsheet(filePath, where, joinType, options);

      res.download(filePath, `template_cost_items_${timestamp}.xlsx`, err => {
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


const instance = new TemplateCostItemsController();

export default instance;
export { TemplateCostItemsController };
