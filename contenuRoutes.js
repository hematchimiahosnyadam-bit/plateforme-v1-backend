const express = require('express');
const { authentifier, autoriserRoles } = require('../middleware/auth');
const { resoudreTenant, exigerModule } = require('../middleware/tenant');
const { obtenirContenu, modifierContenu } = require('../controllers/contenuController');

const router = express.Router();

router.use(authentifier, resoudreTenant, exigerModule('contenu_site'));

router.get('/', obtenirContenu);
router.put('/', autoriserRoles('admin'), modifierContenu);

module.exports = router;
