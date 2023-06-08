'use strict';

// ./admin/models/Miscellaneous.js
// List of miscellaneous names catalog - supports credit card transactions name and miscelaneous checks

const { Model } = require('nap-db');

const miscellaneousSchema = {
    tableName: 'miscellaneous',
    columns: [
        {
            name: 'misc_id',
            type: 'varchar',
            length: 50,
            primary: true,
        },
        {
            name: 'name',
            type: 'varchar',
            length: 100,
            notNull: true,
        },
        {
            name: 'description',
            type: 'varchar',
            length: 255,
        },
        {
            name: 'email',
            type: 'varchar',
            length: 255,
        },
        {
            name: 'phone',
            type: 'varchar',
            length: 18,
        },
        {
            name: 'address_1',
            type: 'varchar',
            length: 255,
        },
        {
            name: 'address_2',
            type: 'varchar',
            length: 255,
            default: '',
            useDefault: true,
        },
        {
            name: 'city',
            type: 'varchar',
            length: 255,
        },
        {
            name: 'region',
            type: 'varchar',
            length: 255,
        },
        {
            name: 'postal_code',
            type: 'varchar',
            length: 255,
        },
        {
            name: 'country',
            type: 'varchar',
        },
    ],
};

/**
 * Companies - Models data in the companies table
 */
class Miscellaneous extends Model {
    static #cs;

    /**
     * Companies data model
     * @param {Object} db - {@link https://vitaly-t.github.io/pg-promise/Database.html pg-promise} database connection represented by class {@link DB}
     * @param {Object} pgp - {@link https://vitaly-t.github.io/pg-promise/module-pg-promise.html pg-promise} object
     * @param {Object} schema - Deep copy of companySChema to map columns
     */
    constructor(db, pgp, schema = JSON.parse(JSON.stringify(miscellaneousSchema))) {
        super(db, pgp, schema);

        if (!Miscellaneous.#cs) {
            Miscellaneous.#cs = this.createColumnsets();
            super.setColumnsets(Miscellaneous.#cs);
        }
    }

    /**
     * Retrieves the ColumnSet object
     * @returns ColumnSet object associated with the data model
     */
    getColumnSet() {
        return Miscellaneous.#cs;
    }
}

module.exports = Miscellaneous;
