'use strict';

// ./app-controller.js

const adminRouter = require('./admin/controllers/admin');
const usersRouter = require('./admin/controllers/users');
const companiesRouter = require('./admin/controllers/companies');

function useRouters(app) {
    app.use('/admin', adminRouter);
    app.use('/', usersRouter);
    app.use('/admin/setup/companies', companiesRouter);
}

module.exports = useRouters;
