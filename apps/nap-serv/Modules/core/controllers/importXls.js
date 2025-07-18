  /**
   * Handles XLS import for addresses, resolving party IDs based on tenant code and party type.
   * @param {object} req - The request object containing user and file information.
   * @param {object} res - The response object to send the result.
   */
  async importXls(req, res) {
    try {
      const tenantCode = req.user?.tenant_code;
      const createdBy = req.user?.user_name || req.user?.email;
      const index = parseInt(req.body.index || '0', 10);
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // import and transform each row
      const result = await this.model(req.schema).importFromSpreadsheet(file.path, index, async row => {
        // console.log('Processing row:', row);

        row.party_id = await resolvePartyId({
          tenantCode: req.user.tenant_code,
          schema: req.schema,
          code: row[`${row.party_type}_code`],
          partyType: row.party_type,
        });
        // console.log('Resolved party ID row:', row);

        // return transformed row
        return {
          ...row,
          tenant_code: tenantCode,
          created_by: createdBy,
        };
      });

      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }

