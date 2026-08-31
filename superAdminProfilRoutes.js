const express = require('express');
const { authentifier, autoriserRoles } = require('../middleware/auth');
const { obtenirMonProfilSuperAdmin, modifierMonProfilSuperAdmin } = require('../controllers/superAdminProfilController');

const router = express.Router();

router.use(authentifier, autoriserRoles('super_admin'));

router.get('/', obtenirMonProfilSuperAdmin);
router.put('/', modifierMonProfilSuperAdmin);

module.exports = router;
