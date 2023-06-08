'use strict';

// './general-ledger/models/GJ.js
// General Journal catalog

const { Model } = require('nap-db');

const gjSchema = {
    tableName: 'general-journal',
    columns: [
        {
            name: 'journal_id',
            type: 'serial'
        },
        {
            name: 'batch_num',
            type: 'uuid',
        },

    ],
    primaryKeys: [
        { name: 'journal_id'},
    ]
}

class GJ extends Model {
    static #cs;

    // Deep copy userSchema to ensure it does not change
    constructor(db, pgp, schema = JSON.parse(JSON.stringify(gjSchema))) {
        super(db, pgp, schema);

        if (!GJ.#cs) {
            GJ.#cs = this.createColumnsets();
            super.setColumnsets(GJ.#cs);
        }
    }
}
