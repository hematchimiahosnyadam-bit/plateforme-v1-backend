const express = require('express');
const { authentifier, autoriserRoles } = require('../middleware/auth');
const { resoudreTenant, exigerModule } = require('../middleware/tenant');
const { statsSuperAdmin, statsEntreprise, statsAnalytics } = require('../controllers/dashboardController');

const router = express.Router();

router.get('/super-admin', authentifier, autoriserRoles('super_admin'), statsSuperAdmin);
router.get('/entreprise', authentifier, resoudreTenant, autoriserRoles('admin', 'gestionnaire_produits', 'gestionnaire_commandes'), statsEntreprise);
router.get('/analytics', authentifier, resoudreTenant, exigerModule('analytics'), autoriserRoles('admin', 'gestionnaire_produits', 'gestionnaire_commandes'), statsAnalytics);

module.exports = router;
