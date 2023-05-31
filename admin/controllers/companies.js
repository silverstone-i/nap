// @ts-nocheck

'use strict';

// ./admin/controllers/companies.js
// Manages /admin/setup/companies route

const multer = require('multer');
const router = require('express').Router();
const { getExcelRows, writeExcelRows } = require('../../services/xlsx');

module.exports = router;

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Get all companies localhost:2828/admin/setup/companies
router.get('/', (req, res) => {
    const columns = req.db.companies.originalSchema.columns.map(
        (column) => column.name
    );

    // Get all data
    req.db.companies
        .findAll(columns)
        .then((dto) =>
            dto.length > 0
                ? res.send(dto)
                : res.status(200).json({ message: 'No records found' })
        )
        .catch((err) => res.status(500).send(err.message));
});

// Conditional get localhost:2828/admin/setup/companies/company_id/WEG?company_id&company&description
router.get('/:column/:value', (req, res) => {
    const columns = Object.keys(req.query);
    const column = req.params.column;
    const value = req.params.value;

    req.db.companies
        .findWhere(columns, column, value)
        .then((dto) =>
            dto
                ? res.send(dto)
                : res.status(200).json({ message: 'No records found' })
        )
        .catch((err) => res.status(500).send(err.message));
});

// Inserts single or multiple rows
router.post('/insert', (req, res) => {
    const dto = req.body;
    const user = 'nap-admin';

    if (dto instanceof Array) {
        dto.forEach((row) => {
            // eslint-disable-next-line no-param-reassign
            row.created_by = user;
        });
    } else {
        dto.created_by = user;
    }

    req.db.companies
        .insert(dto)
        .then(() => res.send('received file ???'))
        .catch((err) => res.status(500).send(err.message));
});

// Updates record with data specified in the dto - must ahve primary key and other values
router.put('/update', (req, res) => {
    const dto = req.body;
    const user = 'nap-admin';

    dto.updated_by = user;

    req.db.companies
        .update(dto)
        .then(res.send('???'))
        .catch((err) => res.status(500).send(err.message));
});

// Import data from .xlsx file
router.post('/import_xslx/:sheet', upload.single('file'), (req, res) => {
    // Access the uploaded file data from req.file.buffer
    // @ts-ignore
    const fileBuffer = req.file.buffer;
    const sheetNo = +req.params.sheet;

    getExcelRows(sheetNo, fileBuffer, 'nap-admin')
        .then((dto) =>
            // @ts-ignore
            req.db.companies
                .insert(dto)
                .then(() => res.send('received file ???'))
                .catch((err) => res.status(500).send(err.message))
        )
        .catch((err) => res.status(400).send(err.message));
});

// Export data to an excel file - sends data buffer to browser to convert
router.get('/export_xslx/:headersOnly', (req, res) => {
    const headersOnly = req.params.headersOnly;

    // Get an array of column headers from the defined schema
    const columns = req.db.companies.originalSchema.columns.map(
        (column) => column.name
    );
    // Get all data in table
    req.db.companies
        // eslint-disable-next-line quotes, prettier/prettier
        .findAll(columns)
        .then((dto) => writeExcelRows(dto, headersOnly))
        .then((buffer) => {
            // Set the appropriate headers for the response
            res.setHeader(
                'Content-Disposition',
                'attachment; filename="companies.xlsx"'
            );
            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );

            // Send the buffer as the response
            res.send(buffer);
        })
        .catch((err) => {
            console.error('Error:', err.message);
            res.status(500).send(err.message);
        });
});
