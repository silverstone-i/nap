'use strict';

// ./admin/controllers/users.js
// Manages user login

const passport = require('passport');
const router = require('express').Router();

module.exports = router;

// User login
router.post('/login', (req, res, next) => {
    // eslint-disable-next-line consistent-return
    passport.authenticate('local', { failureFlash: true }, (err, user) => {
        if (err) {
            return next(err);
        }
        if (!user) {
            const errorMessage = req.flash('error')[0]; // Get the custom flash message
            return res
                .status(401)
                .send(errorMessage || 'Authentication failed');
        }
        return res.status(200).send('Logged In');
    })(req, res, next);
});

// User logout
router.delete('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        return res.send('Logged Out');
    });
});
