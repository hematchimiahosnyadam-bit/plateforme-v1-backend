const fs = require('fs');
const path = require('path');
const { query, pool } = require('../config/db');

/**
 * Transforme le nom d'une entreprise en identifiant de schéma sûr.
 * "Whisky Shop Ouaga" -> "entreprise_whisky_shop_ouaga"
 */
function toSchemaName(nom, id) {
  const base = nom
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire les accents
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return `entreprise_${id}_${base}`;
}

/**
 * Crée une nouvelle entreprise : ligne dans "entreprises" + schéma dédié
 * + toutes les tables du gabarit. Tout se fait dans une transaction :
 * si une étape échoue, rien n'est appliqué (pas de schéma orphelin).
 */
const MODULES_VALIDES = [
  'commandes', 'produits', 'categories', 'ma_boutique',
  'clients', 'promotions', 'analytics', 'contenu_site', 'mediatheque',
];

async function creerEntreprise({ nom, slug, numeroWhatsapp, fonctionnalitesActivees }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const modules = Array.isArray(fonctionnalitesActivees) && fonctionnalitesActivees.length > 0
      ? fonctionnalitesActivees.filter((m) => MODULES_VALIDES.includes(m))
      : MODULES_VALIDES; // par défaut, tout est activé si le Super Admin ne précise rien

    const insertResult = await client.query(
      `INSERT INTO entreprises (nom, slug, schema_name, numero_whatsapp, fonctionnalites_activees)
       VALUES ($1, $2, 'temp', $3, $4)
       RETURNING id`,
      [nom, slug, numeroWhatsapp || null, modules]
    );
    const entrepriseId = insertResult.rows[0].id;
    const schemaName = toSchemaName(nom, entrepriseId);

    await client.query(
      `UPDATE entreprises SET schema_name = $1 WHERE id = $2`,
      [schemaName, entrepriseId]
    );

    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    const gabarit = fs.readFileSync(
      path.join(__dirname, '../../migrations/001_tenant_schema_template.sql'),
      'utf8'
    );
    const contenuMedias = fs.readFileSync(
      path.join(__dirname, '../../migrations/002_contenu_medias.sql'),
      'utf8'
    );
    await client.query(`SET search_path TO "${schemaName}"`);
    await client.query(gabarit);
    await client.query(contenuMedias);
    await client.query('SET search_path TO public');

    await client.query('COMMIT');
    return { id: entrepriseId, nom, slug, schemaName };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getEntrepriseBySlug(slug) {
  const result = await query('SELECT * FROM entreprises WHERE slug = $1', [slug]);
  return result.rows[0] || null;
}

async function getEntrepriseById(id) {
  const result = await query('SELECT * FROM entreprises WHERE id = $1', [id]);
  return result.rows[0] || null;
}

module.exports = { creerEntreprise, getEntrepriseBySlug, getEntrepriseById };
