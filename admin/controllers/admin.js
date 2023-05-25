'use strict';

// ./admin/controllers/admin.js
// Manages user login, role assignment, status

const { DB } = require('nap-db');
const router = require('express').Router();
module.exports = router;

// Routes are on path /admin

router.post('/create/:table', (req, res) => {
    const table = req.params.table;
    // @ts-ignore
    req.db[table]
        .createTable()
        .then(() => res.send(`${table} table created`))
        .catch((err) => res.status(500).send(err.message));
});
