'use strict';

// ./admin/services/passport.js
// Administer passport local strategy

const passport = require('passport');
const session = require('express-session');
const flash = require('express-flash');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');

module.exports = function (app, getUserByEmail) {
    const authenticateUser = (email, password, done) =>
        // eslint-disable-next-line consistent-return
        getUserByEmail(email).then((user) => {
            if (!user) return done(null, false, { message: 'User not found' });

            // Validate user password
            bcrypt.compare(password, user.password, (err, isMatch) => {
                if (err) return done(err, false, { message: err.message });
                if (isMatch) return done(null, user);
                return done(null, false, { message: 'Invalid password' });
            });
        });

    passport.use(
        new LocalStrategy({ usernameField: 'email' }, authenticateUser)
    );

    app.use(flash());
    app.use(
        session({
            // @ts-ignore
            secret: process.env.SECRET_SESSION,
            resave: false,
            saveUninitialized: false,
        })
    );

    app.use(passport.initialize());
    app.use(passport.session());

    passport.serializeUser((user, done) => {
        // @ts-ignore
        console.log('SERIALIZE USER EMAIL: ', user.email);
        // @ts-ignore
        done(null, user.email);
    });

    passport.deserializeUser((email, done) => {
        console.log('DESERIALIZE USER EMAIL: ', email);
        getUserByEmail(email, (err, user) => {
            done(err, user);
        });
    });
};
