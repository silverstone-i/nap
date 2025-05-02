/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

CREATE OR REPLACE VIEW tenantid.orphaned_addresses AS
SELECT a.*
FROM tenantid.addresses a
LEFT JOIN tenantid.vendors v1 ON v1.mailing_address_id = a.id
LEFT JOIN tenantid.vendors v2 ON v2.physical_address_id = a.id
LEFT JOIN tenantid.clients c1 ON c1.billing_address_id = a.id
LEFT JOIN tenantid.clients c2 ON c2.physical_address_id = a.id
LEFT JOIN tenantid.projects p ON p.address_id = a.id
WHERE v1.id IS NULL
  AND v2.id IS NULL
  AND c1.id IS NULL
  AND c2.id IS NULL
  AND p.id IS NULL;