/**
 * @file Contacts controller — standard CRUD for contacts linked via sources
 * @module core/controllers/contactsController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db, { pgp } from '../../../db/db.js';
import { allocateNumber } from '../services/numberingService.js';

class ContactsController extends BaseController {
  constructor() {
    super('contacts');
    this.rbacConfig = { module: 'core', router: 'contacts' };
  }

  /**
   * POST / — insert a contact with optional auto-numbering for code field.
   */
  async create(req, res) {
    try {
      const schema = this.getSchema(req);
      const s = pgp.as.name(schema);

      if (!req.body.tenant_id && req.user?.tenant_id) {
        req.body.tenant_id = req.user.tenant_id;
      }

      const record = await db.tx(async (t) => {
        const contactsModel = this.model(schema);
        contactsModel.tx = t;

        const contact = await contactsModel.insert(req.body);

        // Auto-assign code via numbering service (if enabled and code not provided)
        if (!contact.code) {
          const numbering = await allocateNumber(schema, 'contact', null, new Date(), t);
          if (numbering) {
            await t.none(`UPDATE ${s}.contacts SET code = $1 WHERE id = $2`, [numbering.displayId, contact.id]);
            contact.code = numbering.displayId;
          }
        }

        return contact;
      });

      res.status(201).json(record);
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'creating', this.errorLabel);
    }
  }
}

const instance = new ContactsController();
export default instance;
export { ContactsController };
