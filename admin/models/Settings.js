'use strict';

// ./admin/models/Settings.js
// Manage app settings

const { Model } = require('nap-db');

const settingSchema = {
    tableName: 'settings',
    columns: [
        {
            name: 'key',
            type: 'varchar',
            length: 30,
        },
        {
            name: 'value',
            type: 'varchar',
            length: 30,
            notNull: true,
        },
    ],
    primaryKeys: [
        {
            name: 'key',
        },
    ],
};

class Settings extends Model {
    static #cs;

    constructor(db, pgp, schema = JSON.parse(JSON.stringify(settingSchema))) {
        super(db, pgp, schema);

        if (!Settings.#cs) {
            Settings.#cs = this.createColumnsets();
            super.setColumnsets(Settings.#cs);
        }
    }
}

module.exports = Settings;
