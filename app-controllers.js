'use strict'

// ./app-controller.js

const adminRouter = require('./admin/controllers/admin');

function useRouters(app) {
    app.use('/admin', adminRouter);
}

module.exports = useRouters;