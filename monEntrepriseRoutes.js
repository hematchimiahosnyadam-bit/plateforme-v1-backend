const express = require('express');
const { authentifier, autoriserRoles } = require('../middleware/auth');
const { resoudreTenant, exigerModule } = require('../middleware/tenant');
const { obtenirMonEntreprise, modifierMonEntreprise } = require('../controllers/entrepriseController');

const router = express.Router();

router.use(authentifier, resoudreTenant, exigerModule('ma_boutique'));

router.get('/', obtenirMonEntreprise);
router.put('/', autoriserRoles('admin'), modifierMonEntreprise);

module.exports = router;
