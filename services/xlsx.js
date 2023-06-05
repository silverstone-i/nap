'use strict';

// ./admin/services/xlsx.js
// Read and write excel files
const xlsx = require('xlsx-populate');

const getExcelRows = (sheetNo, fileBuffer, userName) =>
    new Promise((resolve, reject) => {
        xlsx.fromDataAsync(fileBuffer)
            .then((workbook) => {
                const worksheet = workbook.sheet(sheetNo);
                const usedRange = worksheet.usedRange();
                const columnHeaders = usedRange.value()[0];

                resolve(
                    usedRange
                        .value()
                        .slice(1)
                        .map((rowData) => {
                            const rowObject = {};
                            columnHeaders.forEach((header, index) => {
                                rowObject[header] = rowData[index];
                            });
                            rowObject.created_by = userName;
                            console.log(rowObject);
                            return rowObject;
                        })
                );
            })
            .catch(reject);
    });

const writeExcelRows = (rows, headersOnly = false) =>
    new Promise((resolve, reject) => {
        xlsx.fromBlankAsync()
            .then((workbook) => {
                const sheet = workbook.sheet(0);

                // Write headers
                Object.keys(rows[0]).forEach((key, columnIndex) => {
                    sheet.cell(1, columnIndex + 1).value(key);
                });

                // Write rows if headersOnly is false
                if (!headersOnly) {
                    rows.forEach((row, rowIndex) => {
                        Object.values(row).forEach((value, columnIndex) => {
                            sheet
                                .cell(rowIndex + 2, columnIndex + 1)
                                .value(value);
                        });
                    });
                }

                resolve(workbook.outputAsync());
            })
            .catch(reject);
    });

module.exports = {
    getExcelRows,
    writeExcelRows,
};
