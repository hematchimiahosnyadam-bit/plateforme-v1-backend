const { getEntrepriseById } = require('../services/tenantService');

/**
 * Détermine dans quel schéma la requête doit travailler.
 * Le schéma vient UNIQUEMENT du token vérifié (req.auth.entrepriseId),
 * jamais d'un paramètre d'URL ou du body — sinon un utilisateur pourrait
 * changer l'id dans la requête et accéder aux données d'une autre entreprise.
 */
async function resoudreTenant(req, res, next) {
  if (!req.auth || !req.auth.entrepriseId) {
    return res.status(400).json({ erreur: 'Aucune entreprise associée à ce compte' });
  }

  try {
    const entreprise = await getEntrepriseById(req.auth.entrepriseId);

    if (!entreprise) {
      return res.status(404).json({ erreur: 'Entreprise introuvable' });
    }
    if (entreprise.statut !== 'actif') {
      return res.status(403).json({ erreur: 'Cette entreprise est suspendue' });
    }

    req.tenant = { id: entreprise.id, schema: entreprise.schema_name, fonctionnalitesActivees: entreprise.fonctionnalites_activees };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Bloque une route si le module concerné n'est pas activé pour cette
 * entreprise (choix fait par le Super Admin à la création ou modifié
 * ensuite). Toujours utilisé APRÈS resoudreTenant (a besoin de req.tenant).
 * Même logique que autoriserRoles : la vérification doit vivre côté
 * serveur, jamais seulement cachée dans la sidebar.
 */
function exigerModule(nomModule) {
  return (req, res, next) => {
    if (!req.tenant?.fonctionnalitesActivees?.includes(nomModule)) {
      return res.status(403).json({ erreur: `Le module "${nomModule}" n'est pas activé pour cette entreprise` });
    }
    next();
  };
}

module.exports = { resoudreTenant, exigerModule };
