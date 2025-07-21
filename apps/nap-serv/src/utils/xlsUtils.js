'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/



import ExcelJS from 'exceljs';
import path from 'path';

/**
 * Writes an array of objects to an Excel file.
 * @param {Object[]} records - Array of flat objects to write to spreadsheet.
 * @param {string} filePath - Path to output .xlsx file.
 */
async function writeFile(records, filePath) {
  const workbook = new ExcelJS.Workbook();
  const sheetName = path.basename(filePath, path.extname(filePath));
  const worksheet = workbook.addWorksheet(sheetName);

  if (!records.length) {
    worksheet.addRow(['No records found']);
  } else {
    const headers = Object.keys(records[0]);
    worksheet.columns = headers.map(header => ({ header, key: header }));
    records.forEach(record => worksheet.addRow(record));
  }

  await workbook.xlsx.writeFile(filePath);
}

async function parseWorksheet(filePath, sheetIndex) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[sheetIndex];
  if (!worksheet) {
    throw new Error(`Sheet index ${sheetIndex} not found.`);
  }
  const rows = [];
  let headers = [];
  worksheet.eachRow((row, rowNumber) => {
    const values = row.values;
    if (rowNumber === 1) {
      headers = values.slice(1);
    } else {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = values[i + 1];
      });
      rows.push(obj);
    }
  });
  return rows;
}

export { writeFile, parseWorksheet };