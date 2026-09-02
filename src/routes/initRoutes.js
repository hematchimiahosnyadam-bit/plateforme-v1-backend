const express = require('express');
const fs = require('fs');
const path = require('path');
const { pool, query } = require('../config/db');
const { hashPassword } = require('../utils/password');

const router = express.Router();

const MIGRATIONS_SCHEMA_PUBLIC = [
  '000_init_public_schema.sql',
  '003_entreprise_contact.sql',
  '004_fonctionnalites_entreprise.sql',
];

router.get('/', async (req, res) => {
  if (!process.env.INIT_SECRET || req.query.secret !== process.env.INIT_SECRET) {
    return res.status(403).json({ erreur: 'Secret invalide' });
  }

  const resultat = { migrations: [], superAdmin: null };

  try {
    for (const fichier of MIGRATIONS_SCHEMA_PUBLIC) {
      const sql = fs.readFileSync(path.join(__dirname, '../../migrations', fichier), 'utf8');
      await pool.query(sql);
      resultat.migrations.push(fichier);
    }

    const email = process.env.INIT_SUPERADMIN_EMAIL;
    const motDePasse = process.env.INIT_SUPERADMIN_PASSWORD;
    const nom = process.env.INIT_SUPERADMIN_NOM;

    if (email && motDePasse && nom) {
      const existant = await query('SELECT id FROM super_admins WHERE email = $1', [email]);
      if (existant.rows.length === 0) {
        const hash = await hashPassword(motDePasse);
        await query('INSERT INTO super_admins (email, mot_de_passe, nom) VALUES ($1, $2, $3)', [email, hash, nom]);
        resultat.superAdmin = `créé (${email})`;
      } else {
        resultat.superAdmin = `déjà existant (${email}) — rien fait`;
      }
    } else {
      resultat.superAdmin = 'ignoré (INIT_SUPERADMIN_EMAIL/PASSWORD/NOM non définis)';
    }

    res.json({ succes: true, ...resultat });
  } catch (err) {
    res.status(500).json({ succes: false, erreur: err.message });
  }
});

module.exports = router;
