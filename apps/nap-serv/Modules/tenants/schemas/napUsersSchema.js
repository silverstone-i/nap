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
      name: 'tenant_code',
      type: 'varchar',
      length: 6,
      nullable: false,
      unique: true,
      colProps: { skip: c => !c.exists },
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
      name: 'user_name',
      type: 'varchar',
      length: 100,
      nullable: false,
      colProps: { skip: c => !c.exists }
    },
    {
      name: 'role',
      type: 'varchar',
      length: 50,
      nullable: false,
      colProps: { skip: c => !c.exists }
    },
    {
      name: 'is_active',
      type: 'boolean',
      default: 'true',
      nullable: false,
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
      // TODO: Valid roles need to be checked in the tenant employees table
      // {
      //   type: 'Check',
      //   expression: `role IN ('super_admin', 'admin', 'support', 'user')`,
      // },
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
