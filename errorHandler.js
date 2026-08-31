/**
 * Filet de sécurité final : capture toute erreur non gérée dans un
 * contrôleur pour éviter qu'un détail technique (stack trace, requête SQL...)
 * ne soit renvoyé au client.
 */
const logger = require('../config/logger');

function gestionnaireErreurs(err, req, res, next) {
  logger.error(`${req.method} ${req.originalUrl} — ${err.message}`, {
    stack: err.stack,
    statut: err.statut || 500,
  });

  // Erreurs spécifiques à multer (upload) : fichier trop gros, mauvais format...
  if (err.name === 'MulterError' || err.message.includes('Format non autorisé')) {
    return res.status(400).json({ erreur: err.message });
  }

  const statut = err.statut || 500;
  const message = statut === 500
    ? 'Une erreur interne est survenue'
    : err.message;

  res.status(statut).json({ erreur: message });
}

module.exports = { gestionnaireErreurs };
