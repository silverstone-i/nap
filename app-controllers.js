'use strict';

// ./app-controller.js

const adminRouter = require('./admin/controllers/admin');
const usersRouter = require('./admin/controllers/users');

function useRouters(app) {
    app.use('/admin', adminRouter);
    app.use('/', usersRouter);
}

module.exports = useRouters;
