const express = require('express');
const { authentifier, autoriserRoles } = require('../middleware/auth');
const { resoudreTenant, exigerModule } = require('../middleware/tenant');
const { uploadMedia } = require('../middleware/upload');
const { listerMedias, televerserMedia, supprimerMedia } = require('../controllers/mediaController');

const router = express.Router();

router.use(authentifier, resoudreTenant);

// L'upload reste toujours disponible : "Ma boutique" et "Contenu du site"
// s'en servent pour leurs propres images (logo, hero...), même si le
// module "Médiathèque" (la page de navigation/galerie) est désactivé.
router.post('/', autoriserRoles('admin'), uploadMedia.single('image'), televerserMedia);

// Naviguer/gérer la bibliothèque complète est bien la fonctionnalité
// "Médiathèque" à proprement parler — celle-ci reste soumise au module.
router.get('/', exigerModule('mediatheque'), listerMedias);
router.delete('/:id', exigerModule('mediatheque'), autoriserRoles('admin'), supprimerMedia);

module.exports = router;
