// Connexion PostgreSQL centralisée.
// Toutes les requêtes passent par ce pool pour réutiliser les connexions
// (indispensable pour tenir 1000+ visiteurs/jour sans épuiser la base).

const { Pool } = require('pg');
require('dotenv').config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });
const logger = require('./logger');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20, // connexions simultanées max dans le pool
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  logger.error('Erreur inattendue sur une connexion PostgreSQL inactive', { erreur: err.message });
});

/**
 * Exécute une requête sur le schéma "public" (Super Admin, table des entreprises).
 */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Exécute une requête à l'intérieur du schéma d'une entreprise précise.
 * On fixe le search_path pour cette requête uniquement, ce qui garantit
 * qu'une entreprise ne peut jamais lire les données d'une autre.
 */
async function tenantQuery(schemaName, text, params) {
  // Garde-fou anti-injection : un nom de schéma ne doit contenir que
  // lettres, chiffres et underscore (jamais de guillemet, espace, etc.)
  if (!/^[a-z0-9_]+$/i.test(schemaName)) {
    throw new Error('Nom de schéma invalide');
  }

  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schemaName}"`);
    const result = await client.query(text, params);
    return result;
  } finally {
    await client.query('SET search_path TO public');
    client.release();
  }
}

module.exports = { pool, query, tenantQuery };
