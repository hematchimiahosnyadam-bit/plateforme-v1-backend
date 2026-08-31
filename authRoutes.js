const express = require('express');
const rateLimit = require('express-rate-limit');
const { connexionSuperAdmin, connexionAdminEntreprise } = require('../controllers/authController');

const router = express.Router();

// Limite les tentatives de connexion pour freiner le bruteforce.
const limiteurConnexion = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { erreur: 'Trop de tentatives, réessaie plus tard' },
});

router.post('/super-admin/connexion', limiteurConnexion, connexionSuperAdmin);
router.post('/entreprise/connexion', limiteurConnexion, connexionAdminEntreprise);

module.exports = router;
