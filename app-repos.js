// Object of all data models used by application
const Users = require('./admin/models/Users');
const Companies = require('./admin/models/Companies');
const Classifications = require('./admin/models/Classifications');
const Accounts = require('./admin/models/Accounts');
const Settings = require('./admin/models/Settings');
const Ledger = require('./ledger/models/Ledger')
const Miscellaneous = require('./admin/models/Miscellaneous')

const appRepos = {
    users: Users,
    companies: Companies,
    classifications: Classifications,
    accounts: Accounts,
    settings: Settings,
    ledger: Ledger,
    misc: Miscellaneous,
};

module.exports = appRepos;
