'use strict';

// ./admin/controllers/admin.js
// Manages user login, role assignment, status

const {DB} = require('nap-db');
const router = require('express').Router();
module.exports = router;

// Routes are on path /admin

router.post('/create', (req, res) => {
    if(req.db) {
        res.send('Have a valid db object');
    } else {
        res.status(500).send('DB not instantiated');
    }
});