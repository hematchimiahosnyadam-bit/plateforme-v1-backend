const { getEntrepriseBySlug } = require('../services/tenantService');

/**
 * Pour les routes publiques (vitrine boutique, pas d'authentification).
 * Le schéma vient du slug dans l'URL (ex: /api/boutique/whisky-shop-ouaga/produits),
 * jamais d'un id brut — on vérifie aussi que l'entreprise est active.
 */
async function resoudreTenantPublic(req, res, next) {
  try {
    const entreprise = await getEntrepriseBySlug(req.params.slugEntreprise);

    if (!entreprise || entreprise.statut !== 'actif') {
      return res.status(404).json({ erreur: 'Boutique introuvable' });
    }

    req.tenant = { id: entreprise.id, schema: entreprise.schema_name, nom: entreprise.nom };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { resoudreTenantPublic };
