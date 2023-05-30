'use strict';

// ./admin/models/Companies.js
// Companies catalog

const { Model } = require('nap-db');

const companySchema = {
    tableName: 'companies',
    columns: [
        {
            name: 'company_id',
            type: 'varchar',
            length: 3,
            primary: true,
        },
        {
            name: 'company',
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
            name: 'tax_id',
            type: 'varchar',
            length: 15,
            notNull: true,
        },
        {
            name: 'active',
            type: 'boolean',
            notNull: true,
            default: true,
        },
        {
            name: 'address_1',
            type: 'varchar',
            length: 255,
            notNull: true,
        },
        {
            name: 'address_2',
            type: 'varchar',
            length: 255,
        },
        {
            name: 'city',
            type: 'varchar',
            length: 255,
            notNull: true,
        },
        {
            name: 'region',
            type: 'varchar',
            length: 255,
            notNull: true,
        },
        {
            name: 'postal_code',
            type: 'varchar',
            length: 255,
            notNull: true,
        },
        {
            name: 'country',
            type: 'varchar',
            length: 255,
        },
    ],
};

class Companies extends Model {
    static #cs;

    // Deep copy userSchema to ensure it does not change
    constructor(db, pgp, schema = JSON.parse(JSON.stringify(companySchema))) {
        super(db, pgp, schema);

        if (!Companies.#cs) {
            Companies.#cs = this.createColumnsets();
            super.setColumnsets(Companies.#cs);
        }
    }
}

module.exports = Companies;
