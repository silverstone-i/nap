'use strict';

// ./admin/controllers/admin.js
// Manages user login, role assignment, status

const { DB } = require('nap-db');
const bcrypt = require('bcrypt');
const router = require('express').Router();
module.exports = router;

// Routes are on path /admin

/**
 *
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
            if (result.length != 0) {
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
