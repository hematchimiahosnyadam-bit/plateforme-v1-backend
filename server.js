const app = require('./src/app');
const { pool } = require('./src/config/db');
const logger = require('./src/config/logger');

const PORT = process.env.PORT || 4000;
const serveur = app.listen(PORT, () => {
  logger.info(`Serveur démarré sur le port ${PORT}`);
});

/**
 * Arrêt propre : quand l'hébergeur envoie un signal d'arrêt (redéploiement,
 * scaling down...), on laisse les requêtes en cours se terminer et on ferme
 * proprement la connexion à la base, au lieu de couper brutalement.
 */
function arreterProprement(signal) {
  logger.info(`Signal ${signal} reçu, arrêt en cours...`);

  serveur.close(async () => {
    try {
      await pool.end();
      logger.info("Connexions base de données fermées. Arrêt terminé.");
      process.exit(0);
    } catch (err) {
      logger.error("Erreur pendant l'arrêt", { erreur: err.message });
      process.exit(1);
    }
  });

  // Sécurité : si l'arrêt propre traîne trop longtemps, on force l'arrêt.
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => arreterProprement('SIGTERM'));
process.on('SIGINT', () => arreterProprement('SIGINT'));

process.on('unhandledRejection', (raison) => {
  logger.error('Promesse rejetée non gérée', { raison: raison?.message || raison });
});
process.on('uncaughtException', (err) => {
  logger.error('Exception non capturée', { erreur: err.message, stack: err.stack });
  process.exit(1);
});
