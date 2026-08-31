// Prépare une entreprise de test et un Super Admin de test avant les tests,
// et nettoie tout après. Nécessite une vraie base PostgreSQL de test
// (voir DB_NAME dans .env.test) — les tests ne tournent jamais sur la
// base de production.

const { pool } = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');
const { creerEntreprise } = require('../src/services/tenantService');

let entrepriseTest;

async function preparerBaseDeTest() {
  await pool.query(fs_lireMigrationPublique());

  const email = `super-admin-test-${Date.now()}@test.local`;
  const hash = await hashPassword('MotDePasseTest123!');
  await pool.query(
    `INSERT INTO super_admins (email, mot_de_passe, nom) VALUES ($1,$2,'Test')`,
    [email, hash]
  );

  entrepriseTest = await creerEntreprise({
    nom: `Entreprise Test ${Date.now()}`,
    slug: `entreprise-test-${Date.now()}`,
  });

  return { superAdminEmail: email, superAdminMotDePasse: 'MotDePasseTest123!', entrepriseTest };
}

function fs_lireMigrationPublique() {
  const fs = require('fs');
  const path = require('path');
  return fs.readFileSync(path.join(__dirname, '../migrations/000_init_public_schema.sql'), 'utf8');
}

async function nettoyerBaseDeTest() {
  if (entrepriseTest) {
    await pool.query(`DROP SCHEMA IF EXISTS "${entrepriseTest.schemaName}" CASCADE`);
    await pool.query(`DELETE FROM entreprises WHERE id = $1`, [entrepriseTest.id]);
  }
  await pool.query(`DELETE FROM super_admins WHERE email LIKE 'super-admin-test-%'`);
  await pool.end();
}

module.exports = { preparerBaseDeTest, nettoyerBaseDeTest };
