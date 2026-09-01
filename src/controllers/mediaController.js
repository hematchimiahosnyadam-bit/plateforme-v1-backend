const fs = require('fs');
const path = require('path');
const { tenantQuery } = require('../config/db');

const LIMITE_MAX = 60;

async function listerMedias(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limite = Math.min(parseInt(req.query.limite, 10) || 30, LIMITE_MAX);
    const offset = (page - 1) * limite;

    const [medias, total] = await Promise.all([
      tenantQuery(
        schema,
        `SELECT * FROM medias ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limite, offset]
      ),
      tenantQuery(schema, `SELECT COUNT(*)::int AS total FROM medias`),
    ]);

    res.json({
      medias: medias.rows,
      total: total.rows[0].total,
      page,
      limite,
    });
  } catch (err) {
    next(err);
  }
}

async function televerserMedia(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ erreur: 'Aucun fichier reçu' });

    const schema = req.tenant.schema;
    const url = `/uploads/medias/${req.file.filename}`;

    const result = await tenantQuery(
      schema,
      `INSERT INTO medias (url, nom_original, taille_octets) VALUES ($1, $2, $3) RETURNING *`,
      [url, req.file.originalname, req.file.size]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function supprimerMedia(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const { id } = req.params;

    const result = await tenantQuery(schema, `SELECT * FROM medias WHERE id = $1`, [id]);
    const media = result.rows[0];
    if (!media) return res.status(404).json({ erreur: 'Média introuvable' });

    await tenantQuery(schema, `DELETE FROM medias WHERE id = $1`, [id]);

    // Le fichier physique est supprimé après la ligne en base — si la
    // suppression base réussit mais que le fichier ne peut pas être
    // effacé (déjà absent, par ex.), ça ne doit jamais faire échouer la
    // requête : l'entrée en base est la source de vérité pour l'admin.
    const cheminFichier = path.join(__dirname, '../../', media.url);
    fs.unlink(cheminFichier, () => {});

    res.json({ succes: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listerMedias, televerserMedia, supprimerMedia };
