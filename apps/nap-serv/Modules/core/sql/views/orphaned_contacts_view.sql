/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

CREATE OR REPLACE VIEW tenantid.orphaned_contacts AS
SELECT c.*
FROM tenantid.contacts c
LEFT JOIN tenantid.vendors v1 ON v1.accounting_contact_id = c.id
LEFT JOIN tenantid.vendors v2 ON v2.sales_contact_id = c.id
LEFT JOIN tenantid.clients cl ON cl.primary_contact_id = c.id
WHERE v1.id IS NULL
  AND v2.id IS NULL
  AND cl.id IS NULL;