const express = require('express');
const rateLimit = require('express-rate-limit');
const { resoudreTenantPublic } = require('../middleware/publicTenant');
const { authentifier, autoriserRoles } = require('../middleware/auth');
const { resoudreTenant, exigerModule } = require('../middleware/tenant');

const { inscriptionClient, connexionClient, connexionGoogleClient } = require('../controllers/clientAuthController');
const { obtenirPanier, ajouterArticle, modifierQuantite, supprimerArticle } = require('../controllers/panierController');
const {
  creerCommande,
  listerMesCommandes,
  obtenirCommande,
  modifierStatutCommande,
  listerToutesLesCommandes,
} = require('../controllers/commandeController');
const { listerClients, obtenirClient } = require('../controllers/clientAdminController');

const router = express.Router({ mergeParams: true });

const limiteurAuth = rateLimit({ windowMs: 15 * 60 * 1000, max: 15 });

// --- Authentification client (publique, résolue par le slug de la boutique) ---
router.post('/:slugEntreprise/inscription', limiteurAuth, resoudreTenantPublic, inscriptionClient);
router.post('/:slugEntreprise/connexion', limiteurAuth, resoudreTenantPublic, connexionClient);
router.post('/:slugEntreprise/connexion-google', limiteurAuth, resoudreTenantPublic, connexionGoogleClient);

// --- Panier & commandes (réservé aux comptes clients, pas aux admins) ---
// Ici req.tenant vient du token (authentifier + resoudreTenant), pas de l'URL,
// pour être cohérent avec le reste du back-office.
router.get('/panier', authentifier, resoudreTenant, autoriserRoles('client'), obtenirPanier);
router.post('/panier/articles', authentifier, resoudreTenant, autoriserRoles('client'), ajouterArticle);
router.put('/panier/articles/:ligneId', authentifier, resoudreTenant, autoriserRoles('client'), modifierQuantite);
router.delete('/panier/articles/:ligneId', authentifier, resoudreTenant, autoriserRoles('client'), supprimerArticle);

router.post('/commandes', authentifier, resoudreTenant, autoriserRoles('client'), creerCommande);
router.get('/commandes/mes-commandes', authentifier, resoudreTenant, autoriserRoles('client'), listerMesCommandes);
// obtenirCommande reste ouvert client + admin : la distinction se fait DANS le contrôleur
// (un client ne voit que ses propres commandes, un admin voit tout).
router.get('/commandes/:id', authentifier, resoudreTenant, obtenirCommande);

// --- Gestion des commandes côté admin ---
router.get('/admin/commandes', authentifier, resoudreTenant, exigerModule('commandes'), autoriserRoles('admin', 'gestionnaire_commandes'), listerToutesLesCommandes);
router.put('/admin/commandes/:id/statut', authentifier, resoudreTenant, exigerModule('commandes'), autoriserRoles('admin', 'gestionnaire_commandes'), modifierStatutCommande);

// --- Gestion des clients côté admin ---
router.get('/admin/clients', authentifier, resoudreTenant, exigerModule('clients'), autoriserRoles('admin', 'gestionnaire_commandes'), listerClients);
router.get('/admin/clients/:id', authentifier, resoudreTenant, exigerModule('clients'), autoriserRoles('admin', 'gestionnaire_commandes'), obtenirClient);

module.exports = router;
