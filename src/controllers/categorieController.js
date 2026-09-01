const { tenantQuery } = require('../config/db');
const { slugify } = require('../utils/slugify');
const { invaliderCache } = require('../config/cache');

/**
 * Avec jusqu'à 1000 catégories, on renvoie une structure hiérarchique
 * légère (id, nom, parent) plutôt que de tout dupliquer côté client.
 */
async function listerCategories(req, res, next) {
  try {
    const result = await tenantQuery(
      req.tenant.schema,
      `SELECT id, nom, slug, parent_id FROM categories ORDER BY nom`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function creerCategorie(req, res, next) {
  try {
    const { nom, parentId } = req.body;
    if (!nom) return res.status(400).json({ erreur: 'nom est obligatoire' });

    const result = await tenantQuery(
      req.tenant.schema,
      `INSERT INTO categories (nom, slug, parent_id) VALUES ($1,$2,$3) RETURNING *`,
      [nom, slugify(nom), parentId || null]
    );
    await invaliderCache(req.tenant.schema, 'produits');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erreur: 'Une catégorie avec ce nom existe déjà' });
    }
    next(err);
  }
}

async function modifierCategorie(req, res, next) {
  try {
    const { nom, parentId } = req.body;
    if (parentId && String(parentId) === req.params.id) {
      return res.status(400).json({ erreur: 'Une catégorie ne peut pas être son propre parent' });
    }

    const result = await tenantQuery(
      req.tenant.schema,
      `UPDATE categories SET
         nom = COALESCE($1, nom),
         slug = COALESCE($2, slug),
         parent_id = $3
       WHERE id = $4 RETURNING *`,
      [nom, nom ? slugify(nom) : null, parentId || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Catégorie introuvable' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function supprimerCategorie(req, res, next) {
  try {
    const result = await tenantQuery(
      req.tenant.schema,
      `DELETE FROM categories WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Catégorie introuvable' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listerCategories, creerCategorie, modifierCategorie, supprimerCategorie };
