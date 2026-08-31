const express = require('express');
const { resoudreTenantPublic } = require('../middleware/publicTenant');
const { listerProduits, obtenirProduit } = require('../controllers/produitController');
const { listerCategories } = require('../controllers/categorieController');
const { obtenirContenuPublic } = require('../controllers/contenuController');
const { obtenirInfosPubliquesEntreprise } = require('../controllers/entrepriseController');

const router = express.Router({ mergeParams: true });

// Ex: GET /api/boutique/whisky-shop-ouaga/produits
router.get('/:slugEntreprise/produits', resoudreTenantPublic, listerProduits);
router.get('/:slugEntreprise/produits/:slug', resoudreTenantPublic, obtenirProduit);
router.get('/:slugEntreprise/categories', resoudreTenantPublic, listerCategories);
router.get('/:slugEntreprise/contenu', resoudreTenantPublic, obtenirContenuPublic);
router.get('/:slugEntreprise/infos', resoudreTenantPublic, obtenirInfosPubliquesEntreprise);

module.exports = router;
