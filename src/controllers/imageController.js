const fs = require('fs');
const path = require('path');
const { tenantQuery } = require('../config/db');
const { invaliderCache } = require('../config/cache');

async function ajouterImages(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ erreur: 'Aucune image reçue' });
    }

    const schema = req.tenant.schema;
    const produitId = req.params.id;

    // Vérifie que le produit appartient bien à cette entreprise avant d'attacher les images.
    const produit = await tenantQuery(schema, `SELECT id FROM produits WHERE id = $1`, [produitId]);
    if (produit.rows.length === 0) {
      // Nettoie les fichiers déjà écrits sur le disque avant de refuser.
      req.files.forEach((f) => fs.unlink(f.path, () => {}));
      return res.status(404).json({ erreur: 'Produit introuvable' });
    }

    const dernierOrdre = await tenantQuery(
      schema,
      `SELECT COALESCE(MAX(ordre), -1) AS max_ordre FROM produit_images WHERE produit_id = $1`,
      [produitId]
    );
    let ordre = dernierOrdre.rows[0].max_ordre + 1;

    const images = [];
    for (const fichier of req.files) {
      const url = `/uploads/produits/${fichier.filename}`;
      const result = await tenantQuery(
        schema,
        `INSERT INTO produit_images (produit_id, url, ordre) VALUES ($1,$2,$3) RETURNING *`,
        [produitId, url, ordre++]
      );
      images.push(result.rows[0]);
    }

    await invaliderCache(schema, 'produits');
    res.status(201).json(images);
  } catch (err) {
    next(err);
  }
}

async function supprimerImage(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const result = await tenantQuery(
      schema,
      `DELETE FROM produit_images WHERE id = $1 RETURNING url`,
      [req.params.imageId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Image introuvable' });
    }

    const cheminFichier = path.join(__dirname, '../..', result.rows[0].url);
    fs.unlink(cheminFichier, () => {}); // best-effort, ne bloque pas la réponse

    await invaliderCache(schema, 'produits');
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { ajouterImages, supprimerImage };
