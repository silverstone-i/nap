'use strict';

// ./app.js
/**
 * Application entry point
 */

const express = require('express');
const morgan = require('morgan');
const config = require('config');
const path = require('path');
const { DB } = require('nap-db');
require('dotenv').config();
const repositories = require('./app-repos');
const useRouters = require('./app-controllers');

// Create the express app
const app = express();

// Install initial middleware
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({extended: false})); // Parse URL encoded bodies
app.use(morgan('tiny')); // Minimsl logging to console TODO: write to log file

// Read configuration and environment variables to run server and connect to the database
process.env.NODE_ENV = process.env.NODE_ENV || 'development'; // Default is development runtime environment
const connection = config.get(`runtimeEnv.${process.env.NODE_ENV}`); // DB connection object
const HOST = connection.host;
const PORT = connection.server_port || 3000; // Use PORT 3000 if server_port is not defined

// Connect to database
const db = DB.init(connection, repositories);

//Test the connection
db.connect()
    .then((obj) => {
        console.log('Connected to Postgres database!');
    })
    .catch((error) => {
        console.log('Error connecting to Postgres database:', error.message);
    });

// TODO: Add additional required middleware
//  User authentication
//  User authorization
//  Data validation and sanitization
app.use((req, res, next) => {
    // @ts-ignore
    req.db = db;
    next();
})

// TODO: Application routes and catchall errors
useRouters(app);

// Start express server
app.listen(PORT, HOST, (err) => {
    if (err) console.log('Error in server setup', err.message);
    console.log(`NAP server listening on http://${HOST}:${PORT}`);
});
