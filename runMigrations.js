// Applique les migrations du schéma public (entreprises + super_admins,
// puis leurs compléments). Le gabarit tenant (001_...) n'est PAS exécuté
// ici : il est appliqué automatiquement à chaque création d'entreprise,
// via tenantService.js.

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const MIGRATIONS_SCHEMA_PUBLIC = [
  '000_init_public_schema.sql',
  '003_entreprise_contact.sql',
  '004_fonctionnalites_entreprise.sql',
];

async function migrer() {
  for (const fichier of MIGRATIONS_SCHEMA_PUBLIC) {
    const sql = fs.readFileSync(path.join(__dirname, '../../migrations', fichier), 'utf8');
    await pool.query(sql);
    console.log(`Migration appliquée : ${fichier}`);
  }
  console.log('Migrations du schéma public appliquées avec succès.');
  await pool.end();
}

migrer().catch((err) => {
  console.error('Échec de la migration :', err);
  process.exit(1);
});
