const express = require('express');
const { authentifier, autoriserRoles } = require('../middleware/auth');
const { resoudreTenant, exigerModule } = require('../middleware/tenant');
const { upload } = require('../middleware/upload');
const {
  listerProduits,
  obtenirProduit,
  creerProduit,
  modifierProduit,
  supprimerProduit,
} = require('../controllers/produitController');
const { ajouterImages, supprimerImage } = require('../controllers/imageController');

const router = express.Router();

// Réservé aux admins connectés de l'entreprise (voir role autorisés par action).
router.use(authentifier, resoudreTenant, exigerModule('produits'));

router.get('/', listerProduits);
router.get('/:slug', obtenirProduit);
router.post('/', autoriserRoles('admin', 'gestionnaire_produits'), creerProduit);
router.put('/:id', autoriserRoles('admin', 'gestionnaire_produits'), modifierProduit);
router.delete('/:id', autoriserRoles('admin'), supprimerProduit);

router.post(
  '/:id/images',
  autoriserRoles('admin', 'gestionnaire_produits'),
  upload.array('images', 6),
  ajouterImages
);
router.delete('/images/:imageId', autoriserRoles('admin', 'gestionnaire_produits'), supprimerImage);

module.exports = router;
