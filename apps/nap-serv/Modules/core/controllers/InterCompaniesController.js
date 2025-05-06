const db = require('../models');

class InterCompaniesController {
  async getAll(req, res) {
    try {
      const interCompanies = await db.interCompanies.findAll();
      res.json(interCompanies);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async getById(req, res) {
    try {
      const interCompany = await db.interCompanies.findByPk(req.params.id);
      if (interCompany) {
        res.json(interCompany);
      } else {
        res.status(404).json({ error: 'InterCompany not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async create(req, res) {
    try {
      const newInterCompany = await db.interCompanies.create(req.body);
      res.status(201).json(newInterCompany);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const [updated] = await db.interCompanies.update(req.body, {
        where: { id: req.params.id }
      });
      if (updated) {
        const updatedInterCompany = await db.interCompanies.findByPk(req.params.id);
        res.json(updatedInterCompany);
      } else {
        res.status(404).json({ error: 'InterCompany not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async delete(req, res) {
    try {
      const deleted = await db.interCompanies.destroy({
        where: { id: req.params.id }
      });
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(404).json({ error: 'InterCompany not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new InterCompaniesController();
