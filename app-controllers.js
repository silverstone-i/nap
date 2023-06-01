'use strict';

// ./app-controller.js

const adminRouter = require('./admin/controllers/admin');
const usersRouter = require('./admin/controllers/users');
const companiesRouter = require('./admin/controllers/companies');
const classificationsRouter = require('./admin/controllers/classifications');
const accountsRouter = require('./admin/controllers/accounts');

function useRouters(app) {
    app.use('/admin', adminRouter);
    app.use('/', usersRouter);
    app.use('/admin/setup/companies', companiesRouter);
    app.use('/admin/setup/classifications', classificationsRouter);
    app.use('/admin/setup/accounts', accountsRouter);
}

module.exports = useRouters;
