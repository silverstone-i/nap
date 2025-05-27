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
      default: 'uuid_generate_v4()',
      nullable: false,
      immutable: true,
    },
    {
      name: 'email',
      type: 'varchar',
      length: 255,
      nullable: false,
      colProps: { skip: c => !c.exists }
    },
    {
      name: 'password_hash',
      type: 'text',
      nullable: false,
      colProps: { skip: c => !c.exists }
    },
    {
      name: 'first_name',
      type: 'varchar',
      length: 100,
      nullable: true,
      // default: null,
      colProps: { skip: c => !c.exists }
    },
    {
      name: 'last_name',
      type: 'varchar',
      length: 100,
      nullable: true,
      // default: null,
      colProps: { skip: c => !c.exists }
    },
    {
      name: 'role',
      type: 'varchar',
      length: 50,
      default: `'super_admin'`,
      nullable: false,
      colProps: { skip: c => !c.exists }
    },
    {
      name: 'is_active',
      type: 'boolean',
      default: 'true',
      nullable: false,
      // default: true,
      colProps: { skip: c => !c.exists }
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
        expression: `role IN ('super_admin', 'admin', 'support', 'user')`,
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
