'use strict';

// ./admin/models/Accounts.js
// GL accounts catalog

const accountSchema = {
    tableName: 'accounts',
    columns: [
        {
            name: 'account_id',
            type: 'varchar',
            length: 20,
            primary: true,
        },
        {
            name: 'name',
            type: 'varchar',
            length: 50,
            notNull: true,
        },
        {
            name: 'description',
            type: 'varchar',
            length: 255,
        },
        {
            name: 'active',
            type: 'boolean',
            notNull: true,
            default: true,
        },
        {
            name: 'bank_id',
            type: 'numeric',
        },
        {
            name: 'account',
            type: 'varchar',
            length: 25,
        },
    ],
};

const { Model } = require('nap-db');

class Accounts extends Model {
    static #cs;

    // Deep copy userSchema to ensure it does not change
    constructor(db, pgp, schema = JSON.parse(JSON.stringify(accountSchema))) {
        super(db, pgp, schema);

        if (!Accounts.#cs) {
            Accounts.#cs = this.createColumnsets();
            super.setColumnsets(Accounts.#cs);
        }
    }
}

module.exports = Accounts;
