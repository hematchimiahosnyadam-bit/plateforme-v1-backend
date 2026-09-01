const express = require('express');
const { authentifier } = require('../middleware/auth');
const { resoudreTenant } = require('../middleware/tenant');
const { obtenirMonProfil, modifierMonProfil } = require('../controllers/monProfilController');

const router = express.Router();

router.use(authentifier, resoudreTenant);

router.get('/', obtenirMonProfil);
router.put('/', modifierMonProfil);

module.exports = router;
