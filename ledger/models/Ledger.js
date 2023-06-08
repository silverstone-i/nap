'use strict';

// ./ledger/models/Ledger.js
// General Journal catalog

const { Model } = require('nap-db');

const ledgerSchema = {
    tableName: 'ledger',
    columns: [
        {
            name: 'sequence',
            type: 'serial',
            notNull: true,
        },
        {
            name: 'company_id',
            type: 'varchar',
            length: 3,
            notNull: true,
        },
        {
            name: 'account_id',
            type: 'varchar',
            length: 20,
            notNull: true,
        },
        {
            name: 'date',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            useDefault: true,
            notNull: true,
        },
        {
            name: 'batch',
            type: 'integer',
            notNull: true,
        },
        {
            name: 'amount',
            type: 'money',
            notNull: true,
        },
        {
            name: 'db_cr_code',
            type: 'char',
            length: 1,
            notNull: true
        },
        {
            name: 'remark',
            type: 'varchar',
            length: 100,
        },
        {
            name: 'module',
            type: 'varchar',
            length: 25,
        },
        {
            name: 'module_ref',
            type: 'varchar',
            length: 25,
        },
    ],
    primaryKeys: [
        {
            name: 'sequence',
        },
    ],
}

class Ledger extends Model {
    static #cs;

    // Deep copy userSchema to ensure it does not change
    constructor(db, pgp, schema = JSON.parse(JSON.stringify(ledgerSchema))) {
        super(db, pgp, schema);

        if (!Ledger.#cs) {
            Ledger.#cs = this.createColumnsets();
            super.setColumnsets(Ledger.#cs);
        }
    }
}

module.exports = Ledger;