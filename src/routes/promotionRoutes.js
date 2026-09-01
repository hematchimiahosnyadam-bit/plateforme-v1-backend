const express = require('express');
const { authentifier, autoriserRoles } = require('../middleware/auth');
const { resoudreTenant, exigerModule } = require('../middleware/tenant');
const {
  creerPromotion,
  listerPromotions,
  modifierPromotion,
  supprimerPromotion,
  appliquerCodePromo,
} = require('../controllers/promotionController');

const router = express.Router();

router.use(authentifier, resoudreTenant);

// Un client applique un code au panier — jamais bloqué par exigerModule,
// ce n'est pas une action de gestion admin.
router.post('/appliquer', appliquerCodePromo);

// Gestion réservée aux admins, et seulement si le module est activé
// pour cette entreprise.
router.get('/', exigerModule('promotions'), autoriserRoles('admin', 'gestionnaire_produits'), listerPromotions);
router.post('/', exigerModule('promotions'), autoriserRoles('admin', 'gestionnaire_produits'), creerPromotion);
router.put('/:id', exigerModule('promotions'), autoriserRoles('admin', 'gestionnaire_produits'), modifierPromotion);
router.delete('/:id', exigerModule('promotions'), autoriserRoles('admin'), supprimerPromotion);

module.exports = router;
