'use strict';

// ./general-ledger/models/GL.js
// General Journal catalog

const { Model } = require('nap-db');

const glSchema = {
    tableName: 'general-ledger',
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
            type: 'number',
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
    ],
    primaryKeys: [
        {
            name: 'sequence',
        },
    ],
}

class GeneralLedger extends Model {
    static #cs;

    // Deep copy userSchema to ensure it does not change
    constructor(db, pgp, schema = JSON.parse(JSON.stringify(glSchema))) {
        super(db, pgp, schema);

        if (!GeneralLedger.#cs) {
            GeneralLedger.#cs = this.createColumnsets();
            super.setColumnsets(GeneralLedger.#cs);
        }
    }
}

module.exports = GeneralLedger;