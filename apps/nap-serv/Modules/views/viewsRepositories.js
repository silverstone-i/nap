'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import ExportAddresses from "./models/ExportAddresses.js";
import ExportTemplateTasks from "./models/ExportTemplateTasks.js";
import ExportTemplateCostItems from "./models/ExportTemplateCostItems.js";
import ExportContacts from "./models/ExportContacts.js";

const repositories = {
  exportAddresses: ExportAddresses,
  exportTemplateTasks: ExportTemplateTasks,
  exportTemplateCostItems: ExportTemplateCostItems,
  exportContacts: ExportContacts,
};

export default repositories;

