// Object of all data models used by application
const Users = require('./admin/models/Users');
const Companies = require('./admin/models/Companies');
const Classifications = require('./admin/models/Classifications');
const Accounts = require('./admin/models/Accounts');

const appRepos = {
    users: Users,
    companies: Companies,
    classifications: Classifications,
    accounts: Accounts,
};

module.exports = appRepos;
