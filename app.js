'use strict';

// ./app.js
/**
 * Application entry point
 */
// eslint-disable-next-line global-require
if (process.env.NODE_ENV !== 'production') require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const config = require('config');
const { DB } = require('nap-db');
const repositories = require('./app-repos');
const useRouters = require('./app-controllers');
const initializePassport = require('./admin/services/passport');

// Create the express app
const app = express();

// Install initial middleware
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: false })); // Parse URL encoded bodies
app.use(morgan('tiny')); // Minimsl logging to console TODO: write to log file

// Read configuration and environment variables to run server and connect to the database
process.env.NODE_ENV = process.env.NODE_ENV || 'development'; // Default is development runtime environment
const connection = config.get(`runtimeEnv.${process.env.NODE_ENV}`); // DB connection object
const HOST = connection.host;
const PORT = connection.server_port || 3000; // Use PORT 3000 if server_port is not defined

// Connect to database
const db = DB.init(connection, repositories);

// Test the connection
db.connect()
    .then(() => {
        console.log('Connected to Postgres database!');
    })
    .catch((error) => {
        console.log('Error connecting to Postgres database:', error.message);
    });

// TODO: Add additional required middleware
//  User authentication
//  User authorization
//  Data validation and sanitization
initializePassport(
    app,
    (email) =>
        new Promise((resolve, reject) => {
            db.users
                .findWhere('*', 'email', email)
                .then((row) => {
                    resolve(row); // Resolve the Promise with the row value
                })
                .catch((err) => {
                    reject(err); // Reject the Promise with the error
                });
        })
);

// Allow access to db in middleware
app.use((req, res, next) => {
    // @ts-ignore
    req.db = db;
    next();
});

// TODO: Authentication and authorization middleware - combine with db above?
app.use((req, res, next) => {
    req.user = 'nap-admin';
    next();
});

// TODO: Application routes and catchall errors
useRouters(app);

// eslint-disable-next-line consistent-return
app.use((err, req, res, next) => {
    // Check if the error has already been sent to the client
    if (res.headersSent) {
        return next(err);
    }

    // Log the error for debugging (optional)
    console.error(err);

    // Set a default status code for the error
    const statusCode = err.statusCode || 500;

    // Send the error response to the client
    res.status(statusCode).json({
        error: {
            message: err.message || 'Internal Server Error',
        },
    });
});

// Start express server
app.listen(PORT, HOST, (err) => {
    if (err) console.log('Error in server setup', err.message);
    console.log(`NAP server listening on http://${HOST}:${PORT}`);
});
