'use strict';

// ./admin/models/Classifications.js
// GL Classifications catalog

const classificationSchema = {
    tableName: 'classifications',
    columns: [
        {
            name: 'classification_id',
            type: 'varchar',
            length: 15,
            primary: true,
        },
        {
            name: 'description',
            type: 'varchar',
            length: 50,
            notNull: true,
        },
    ],
};

const { Model } = require('nap-db');

class Classifications extends Model {
    static #cs;

    // Deep copy userSchema to ensure it does not change
    constructor(
        db,
        pgp,
        schema = JSON.parse(JSON.stringify(classificationSchema))
    ) {
        super(db, pgp, schema);

        if (!Classifications.#cs) {
            Classifications.#cs = this.createColumnsets();
            super.setColumnsets(Classifications.#cs);
        }
    }
}

module.exports = Classifications;
