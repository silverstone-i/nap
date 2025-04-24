/**
 * @typedef {import('../../../db/typedefs.js').TableSchema} TableSchema
 */

/** @type {TableSchema} */
const napUserSchema = {
  dbSchema: 'admin',
  table: 'nap_users',
  version: '0.1.0',
  hasAuditFields: true,

  columns: [
    {
      name: 'id',
      type: 'uuid',
      default: 'uuidv7()',
      nullable: false,
      immutable: true,
    },
    {
      name: 'email',
      type: 'varchar',
      length: 255,
      nullable: false,
    },
    {
      name: 'password_hash',
      type: 'text',
      nullable: false,
    },
    {
      name: 'first_name',
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    {
      name: 'last_name',
      type: 'varchar',
      length: 100,
      nullable: true,
    },
    {
      name: 'role',
      type: 'varchar',
      length: 50,
      default: `'super_admin'`,
      nullable: false,
    },
    {
      name: 'is_active',
      type: 'boolean',
      default: 'true',
      nullable: false,
    },
  ],

  constraints: {
    primaryKey: ['id'],
    unique: [['email']],
    checks: [
      {
        type: 'Check',
        expression: `char_length(email) > 3`,
      },
      {
        type: 'Check',
        expression: `role IN ('super_admin', 'support')`,
      },
    ],
    indexes: [
      {
        type: 'Index',
        columns: ['email'],
      },
      {
        type: 'Index',
        columns: ['role'],
      },
    ],
  },
};

export default napUserSchema;
