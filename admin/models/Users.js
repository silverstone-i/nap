'use strict';

// ./admin/models/Users.js
// User catalog

const { Model } = require('nap-db');

const userSchema = {
    tableName: 'users',
    columns: [
        {
            name: 'email',
            type: 'varchar',
            length: 255,
        },
        {
            name: 'password',
            type: 'varchar',
            length: 255,
            notNull: true,
        },
        {
            name: 'full_name',
            type: 'varchar',
            length: 50,
            notNull: true,
        },
        {
            name: 'role',
            type: 'varchar',
            length: 25,
            notNull: true,
        },
        {
            name: 'active',
            type: 'bool',
            notNull: true,
            default: true,
        },
    ],
    primaryKeys: [
        {
            name: 'email',
        }
    ]
};

class Users extends Model {
    static #cs;

    // Deep copy userSchema to ensure it does not change
    constructor(db, pgp, schema = JSON.parse(JSON.stringify(userSchema))) {
        super(db, pgp, schema);

        if (!Users.#cs) {
            Users.#cs = this.createColumnsets();
            super.setColumnsets(Users.#cs);
        }
    }
}

module.exports = Users;
