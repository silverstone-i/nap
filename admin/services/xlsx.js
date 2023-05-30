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
                            return rowObject;
                        })
                );
            })
            .catch(reject);
    });

module.exports = getExcelRows;
