const express = require('express');
const { authentifier, autoriserRoles } = require('../middleware/auth');
const {
  creerNouvelleEntreprise,
  listerEntreprises,
  obtenirEntreprise,
  modifierStatutEntreprise,
  modifierFonctionnalitesEntreprise,
  listerAdminsEntreprise,
  creerAdminEntreprise,
  modifierAdminEntreprise,
  supprimerAdminEntreprise,
} = require('../controllers/entrepriseController');

const router = express.Router();

// Toutes les routes ci-dessous sont réservées au Super Admin.
router.use(authentifier, autoriserRoles('super_admin'));

router.get('/', listerEntreprises);
router.post('/', creerNouvelleEntreprise);
router.get('/:id', obtenirEntreprise);
router.put('/:id/statut', modifierStatutEntreprise);
router.put('/:id/fonctionnalites', modifierFonctionnalitesEntreprise);

router.get('/:id/admins', listerAdminsEntreprise);
router.post('/:id/admins', creerAdminEntreprise);
router.put('/:id/admins/:userId', modifierAdminEntreprise);
router.delete('/:id/admins/:userId', supprimerAdminEntreprise);

module.exports = router;
