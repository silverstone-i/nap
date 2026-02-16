/**
 * @file XLS utilities — parse/write Excel spreadsheets via @nap-sft/xlsxjs
 * @module nap-serv/lib/xlsUtils
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import ExcelJS from '@nap-sft/xlsxjs';

/**
 * Parse an XLSX worksheet into an array of row objects.
 * Row 1 is treated as column headers; subsequent rows become objects.
 *
 * @param {string} filePath Path to the .xlsx file
 * @param {number} [sheetIndex=0] Zero-based worksheet index
 * @returns {Promise<object[]>} Parsed row objects
 */
export async function parseWorksheet(filePath, sheetIndex = 0) {
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
      headers = values.slice(1); // skip empty 0-index
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
