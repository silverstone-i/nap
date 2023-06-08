'use strict';

// ./ledger/controllers/ledger.js
// Manages /ledger/ route

/** Express router providing account related routes
 * @module routers/ledger
 * @requires multer
 * @requires express.Router()
 * @requires ../../services/xlsx
 * @requires ../../services/type-defs
 */

/**
 * Routes to mange data in the accounts table.
 * @type {object}
 * @const
 * @namespace ledgerRouter
 */

const multer = require('multer');
const router = require('express').Router();
const { getExcelRows, writeExcelRows } = require('../../services/xlsx');
const DTO = require('../../services/type-defs');

module.exports = router;

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * This callback is displayed as part of the request route.
 * @callback callback~expressCallback
 * @param {Object} req - express request object
 * @param {Object} res - express response object
 */

/**
 * Select records in the accounts table
 * @name GET/find
 * @function
 * @memberof module:routers/ledger~ledgerRouter
 * @inner
 * @param {string} path - Router path - /admin/accounts/find
 * @param {callback} middleware - Express middleware.
 * @return {Array[]} - Array of objects representing all records found
 */
router.get('/find', (req, res) => {
    const dto = req.body;

    // @ts-ignore
    req.db.ledger
        .find(dto)
        .then((data) =>
            data
                ? res.json(data)
                : res.status(200).json({ message: 'No records found' })
        )
        .catch((err) => res.status(500).json({ message: `${err.message}` }));
});

/**
 * Insert a new account in accounts table
 * @name POST/insert
 * @function
 * @memberof module:routers/ledger~ledgerRouter
 * @inner
 * @param {string} path - Router path - /admin/accounts/insert
 * @param {callback} middleware - Middleware.
 * @param {DTO} req.body - Data to be inserted
 * @return {string} message -Error or 'Data was inserted'
 */
router.post('/insert', (req, res) => {
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
    req.db.ledger
        .insert(dto)
        .then(() => res.json({ message: 'Data was inserted' }))
        .catch((err) => res.status(500).json({ message: `${err.message}` }));
});
