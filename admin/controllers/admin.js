'use strict';

// ./admin/controllers/admin.js
// Manages user login, role assignment, status

/** Express router providing settings related routes
 * @module routers/admin
 * @requires multer
 * @requires bcrypt
 * @requires express.Router()
 * @requires ../../services/xlsx
 * @requires ../../services/type-defs
 */

/**
 * Routes to manage application settings.
 * @type {object}
 * @const
 * @namespace adminRouter
 */

const multer = require('multer');
const bcrypt = require('bcrypt');
const router = require('express').Router();
const { getExcelRows, writeExcelRows } = require('../../services/xlsx');
const DTO = require('../../services/type-defs');

module.exports = router;

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Routes are on path /admin

/**
 * TO DO only allow users table to be created
 * @param tableName - name of table associated with a model schema
 */
router.post('/create/:table', (req, res) => {
    const table = req.params.table;
    // @ts-ignore
    req.db[table]
        .createTable()
        .then(() => res.send(`${table} table created`))
        .catch((err) => res.status(500).send(err.message));
});

/**
 *  MUST BE THE FIRST USER IN THE USER TABLE
 */
router.post('/signup', (req, res) => {
    const dto = req.body;

    // Make sure users table is empty
    // @ts-ignore
    req.db.users
        .findAll('*')
        .then((result) => {
            if (result.length !== 0) {
                return res.status(400).send('Not allowed');
            }
            return bcrypt.hash(dto.password, 12);
        })
        .then((hash) => {
            dto.password = hash;
            // @ts-ignore
            req.db.users
                .insert(dto)
                .then(() => res.status(200).send('User created'));
        })
        .catch((err) => res.status(500).send(err.message));
});

// Settings routes

/**
 * This callback is displayed as part of the request route.
 * @callback callback~expressCallback
 * @param {Object} req - express request object
 * @param {Object} res - express response object
 */

/**
 * Export settings records or headers only to excel file
 * @name GET/export_xslx
 * @function
 * @memberof module:routers/admin~adminRouter
 * @inner
 * @param {string} path - Router path - /admin/settings/export_xslx/:headersOnly
 * @param {callback} middleware - Middleware.
 * @param {boolean} headersOnly - True if only headers are to be exported
 * @return {Buffer|string} buffer - File buffer containing exported data
 * @example 
 * Usage to print all records
 * ...
 * const url = 'http://localhost:2828/admin/settings/export_xslx'
 * ...
 * Usage to print headers only
 * ...
 * const url = 'http://localhost:2828/admin/settings/export_xslx?headersOnly=true'
 * ...
 */
router.get('/settings/export_xslx/', (req, res) => {
    const headersOnly = req.query.headersOnly === 'true';

    // Get an array of column headers from the defined schema
    // @ts-ignore
    const columns = req.db.settings.originalSchema.columns.map(
        (column) => column.name
    );
    // Get all data in table
    // @ts-ignore
    req.db.settings
        // eslint-disable-next-line quotes, prettier/prettier
        .find(columns)
        .then((dto) => writeExcelRows(dto, headersOnly))
        .then((buffer) => {
            // Set the appropriate headers for the response
            res.setHeader(
                'Content-Disposition',
                'attachment; filename="settings.xlsx"'
            );
            res.setHeader(
                'Content-Type',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );

            // Send the buffer as the response
            res.send(buffer);
        })
        .catch((err) => {
            res.status(500).json({ message: `${err.message}` });
        });
});

/**
 * Select records in the settings table
 * @name GET/find
 * @function
 * @memberof module:routers/admin~adminRouter
 * @inner
 * @param {string} path - Router path - /admin/settings/find
 * @param {callback} middleware - Express middleware.
 * @return {Array[]} - Array of objects representing all records found
 */
router.get('/settings/find', (req, res) => {
    const dto = req.body;

    // @ts-ignore
    req.db.settings
        .find(dto)
        .then((data) =>
            data
                ? res.json(data)
                : res.status(200).json({ message: 'No records found' })
        )
        .catch((err) => res.status(500).json({ message: `${err.message}` }));
});

/**
 * Import settings from excel file
 * @name POST/import_xslx/:sheet
 * @function
 * @memberof module:routers/admin~adminRouter
 * @inner
 * @param {string} path - Router path - /admin/settings/import_xslx/:sheet
 * @param {callback} middleware - Middleware.
 * @return {string} message - Error or 'Data was imported'
 */
router.post('/settings/import_xslx/:sheet', upload.single('file'), (req, res) => {
    // Access the uploaded file data from req.file.buffer
    // @ts-ignore
    const fileBuffer = req.file.buffer;
    const sheetNo = +req.params.sheet;

    getExcelRows(sheetNo, fileBuffer, 'nap-admin')
        .then((dto) =>
            // @ts-ignore
            req.db.settings
                .insert(dto)
                .then(() => res.json({ message: 'Data was imported' }))
                .catch((err) => res.status(500).send(err.message))
        )
        .catch((err) => res.status(400).json({ message: `${err.message}` }));
});

/**
 * Insert a new setting in settings table
 * @name POST/insert
 * @function
 * @memberof module:routers/admin~adminRouter
 * @inner
 * @param {string} path - Router path - /admin/settings/insert
 * @param {callback} middleware - Middleware.
 * @param {DTO} req.body - Data to be inserted
 * @return {string} message -Error or 'Data was inserted'
 */
router.post('/settings/insert', (req, res) => {
    const dto = req.body;
    const user = req.user;

    if (dto instanceof Array) {
        dto.forEach((row) => {
            // eslint-disable-next-line no-param-reassign
            row.created_by = user;
        });
    } else {
        dto.created_by = user;
    }

    // @ts-ignore
    req.db.settings
        .insert(dto)
        .then(() => res.json({ message: 'Data was inserted' }))
        .catch((err) => res.status(500).json({ message: `${err.message}` }));
});

/** Updates a setting in settins table
 * @name PUT/update
 * @function
 * @memberof module:routers/admin~adminRouter
 * @inner
 * @param {string} path - Router path - /admin/settings/update
 * @param {callback} middleware - Middleware.
 * @param {DTO} req.body - Data to be updated
 * @return {string} message -Error or 'Record was updated'
 * @example
 * ...
 * // DTO to be processed
 * const dto = {
 *      company_id: '010',      // PRIMARY KEY - Required
 *      active: false,           // Column to be updated - At least 1 column is required
 * }
 * ...
 */
router.put('/settings/update', (req, res) => {
    const dto = req.body;
    const user = req.user;

    dto.updated_by = user;

    // @ts-ignore
    req.db.settings
        .update(dto)
        .then(() => res.json({ message: 'Record was updated' }))
        .catch((err) => res.status(500).json({ message: `${err.message}` }));
});
