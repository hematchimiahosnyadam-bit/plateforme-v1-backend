// À exécuter une seule fois après l'ajout d'une nouvelle migration tenant
// (ex: 002_contenu_medias.sql) pour la propager aux entreprises créées
// AVANT cet ajout. Les nouvelles entreprises la reçoivent déjà
// automatiquement via tenantService.js.
//
// Usage : node src/utils/migrerTenantsExistants.js migrations/002_contenu_medias.sql

const fs = require('fs');
const path = require('path');
const { pool, query } = require('../config/db');

async function migrerTousLesTenants(cheminMigration) {
  const sql = fs.readFileSync(path.join(__dirname, '../../', cheminMigration), 'utf8');
  const { rows: entreprises } = await query('SELECT id, nom, schema_name FROM entreprises');

  for (const entreprise of entreprises) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET search_path TO "${entreprise.schema_name}"`);
      await client.query(sql);
      await client.query('SET search_path TO public');
      await client.query('COMMIT');
      console.log(`OK — ${entreprise.nom} (${entreprise.schema_name})`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`ÉCHEC — ${entreprise.nom} (${entreprise.schema_name}) :`, err.message);
    } finally {
      client.release();
    }
  }

  await pool.end();
}

const cheminMigration = process.argv[2];
if (!cheminMigration) {
  console.error('Usage : node src/utils/migrerTenantsExistants.js <chemin-vers-migration.sql>');
  process.exit(1);
}

migrerTousLesTenants(cheminMigration).catch((err) => {
  console.error('Échec général :', err);
  process.exit(1);
});
