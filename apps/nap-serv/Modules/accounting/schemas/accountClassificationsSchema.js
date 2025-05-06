'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

 const accountClassificationsSchema = {
  dbSchema: 'admin',
  table: 'account_classifications',
  hasAuditFields: true,
  version: '1.0.0',

  constraints: {
    primaryKey: ['id'],
  },

  columns: [
    { name: 'id', type: 'varchar(8)', nullable: false }, // e.g. '1.1', '5.6'
    { name: 'name', type: 'varchar(64)', nullable: false }, // e.g. 'Cash', 'Payroll'
    { name: 'type', type: 'varchar(16)', nullable: false }, // 'asset', 'expense', etc.
    { name: 'description', type: 'text', nullable: true },
  ],
};

export default accountClassificationsSchema;