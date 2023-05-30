'use strict';

// ./admin/controllers/companies.js
// Manages /admin/setup/companies route

const multer = require('multer');
const router = require('express').Router();
const getExcellRows = require('../services/xlsx');

module.exports = router;

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Retrieve companies page ?? TODO: Learn REACT
router.get('/', (req, res) => {
    res.send('You are at the companies page');
});

// Import data from .xlsx file
router.post('/import_xslx/:sheet', upload.single('file'), (req, res) => {
    // Access the uploaded file data from req.file.buffer
    // @ts-ignore
    const fileBuffer = req.file.buffer;
    const sheetNo = req.params.sheet;
    console.log(fileBuffer);

    getExcellRows(sheetNo, fileBuffer, 'nap-admin')
        .then((dto) => {
            // @ts-ignore
            req.db.companies.insert(dto).catch((err) => Promise.reject(err));
        })
        .catch((err) => Promise.reject(err));

    res.send('received file ???');
});

// router.get('/export_xslx', (req, res) => {
//     // TODO:
// });
