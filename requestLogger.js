const logger = require('../config/logger');

/**
 * Journalise chaque requête avec son temps de réponse — utile pour repérer
 * les endpoints lents une fois en production, sans avoir à tout instrumenter
 * manuellement.
 */
function journaliserRequetes(req, res, next) {
  const debut = Date.now();

  res.on('finish', () => {
    const duree = Date.now() - debut;
    const niveau = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[niveau](`${req.method} ${req.originalUrl} ${res.statusCode} — ${duree}ms`);
  });

  next();
}

module.exports = { journaliserRequetes };
