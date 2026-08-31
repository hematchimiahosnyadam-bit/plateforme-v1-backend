const express = require('express');
const { authentifier, autoriserRoles } = require('../middleware/auth');
const { resoudreTenant, exigerModule } = require('../middleware/tenant');
const {
  listerCategories,
  creerCategorie,
  modifierCategorie,
  supprimerCategorie,
} = require('../controllers/categorieController');

const router = express.Router();

router.use(authentifier, resoudreTenant, exigerModule('categories'));

router.get('/', listerCategories);
router.post('/', autoriserRoles('admin', 'gestionnaire_produits'), creerCategorie);
router.put('/:id', autoriserRoles('admin', 'gestionnaire_produits'), modifierCategorie);
router.delete('/:id', autoriserRoles('admin'), supprimerCategorie);

module.exports = router;
