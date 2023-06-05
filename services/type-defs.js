/* eslint-disable no-unused-vars */
// ./admin/service/table-schema.js

/**
 * @typedef {Object} Column
 * @property {!string} name - The name of the column.
 * @property {!string} type - The data type of the column. Must be 'char' for length to be required.
 * @property {number} [length] - The length of the column (required if type is 'char').
 * @property {boolean} [unique] - Indicates whether the column values must be unique.
 * @property {boolean} [notNull] - Indicates whether the column can have null values.
 * @property {boolean} [primary] - Indicates whether the column is a primary key.
 * @property {string} [default] - The default value for the column.
 * @property {boolean} [useDefault] - Indicates whether to use the default value for the column.
 */

/**
 * @typedef {Object} ForeignKey
 * @property {Array<{ name: string }>} hasRelations - The columns used to link the foreign key to the referenced table.
 * @property {Array<{ name: string }>} withColumns - The array of related columns.
 * @property {string} withTable - The name of the table being referenced.
 * @property {string} onDeleteAction - The action to perform on deletion.
 * @property {string} onUpdateAction - The action to perform on update.
 */

/**
 * @typedef {Object} TableSchema
 * @property {string} tableName - The name of the table.
 * @property {string} dbSchema - The name of the database schema.
 * @property {boolean} timeStamps - Indicates whether timestamps are enabled.
 * @property {boolean} useCS - Indicates whether to use case-sensitive column names.
 * @property {Array<Column>} columns - The array of column objects.
 * @property {Array<ForeignKey>} foreignKeys - The array of foreign key objects.
 *
 * @example
 *
 * const tableSchema = {
 *     tableName: 'string',
 *     dbSchema: 'string',
 *     timeStamps: true,
 *     useCS: true,
 *     columns: [
 *         {
 *             name: 'string',
 *             type: 'string',
 *             length: 10,
 *             unique: false,
 *             notNull: true,
 *             default: 'default value',
 *             useDefault: true,
 *         },
 *     ],
 *     primaryKeys: [{ name: 'primary_key1 }, { name: 'primary_key2' }],
 *     foreignKeys: [
 *         {
 *             hasRelations: [{ name: 'relation1' }, { name: 'relation2' }],
 *             withColumns: [{ name: 'column1' }, { name: 'column2' }],
 *             withTable: 'relatedTable',
 *             onDeleteAction: 'action1',
 *             onUpdateAction: 'action2',
 *         },
 *     ],
 * };
 */

/**
 * @typedef {Object.<string, any>} DTO
 *
 * This represents a Data Transfer Object that can hold row data from any table.
 * The keys represent column names, and the values represent the corresponding data.
 * The actual column names and data types will vary depending on the table.
 */

/**
 * @type {DTO}
 */
const dto = {}

/** @type {TableSchema} */
// @ts-ignore
const tableSchema = {}

module.exports = {}