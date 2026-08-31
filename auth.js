const { verifierToken } = require('../utils/jwt');

/**
 * Vérifie qu'un token valide est présent. Attache les infos du token
 * (req.auth) pour que les middlewares/contrôleurs suivants sachent
 * QUI fait la requête et pour QUELLE entreprise.
 */
function authentifier(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ erreur: 'Authentification requise' });
  }

  try {
    const token = header.split(' ')[1];
    req.auth = verifierToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ erreur: 'Token invalide ou expiré' });
  }
}

/**
 * Restreint une route à certains rôles. À utiliser après authentifier().
 * Exemple : autoriserRoles('super_admin')
 */
function autoriserRoles(...rolesAutorises) {
  return (req, res, next) => {
    if (!req.auth || !rolesAutorises.includes(req.auth.role)) {
      return res.status(403).json({ erreur: 'Accès refusé' });
    }
    next();
  };
}

module.exports = { authentifier, autoriserRoles };
