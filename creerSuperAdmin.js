// Utilisation : node src/utils/creerSuperAdmin.js "email@exemple.com" "motdepasse" "Nom"

const { query, pool } = require('../config/db');
const { hashPassword } = require('./password');

async function creerSuperAdmin() {
  const [, , email, motDePasse, nom] = process.argv;

  if (!email || !motDePasse || !nom) {
    console.error('Utilisation : node creerSuperAdmin.js <email> <mot_de_passe> <nom>');
    process.exit(1);
  }

  const hash = await hashPassword(motDePasse);
  await query(
    `INSERT INTO super_admins (email, mot_de_passe, nom) VALUES ($1, $2, $3)`,
    [email, hash, nom]
  );

  console.log(`Super Admin créé : ${email}`);
  await pool.end();
}

creerSuperAdmin().catch((err) => {
  console.error('Erreur :', err.message);
  process.exit(1);
});
