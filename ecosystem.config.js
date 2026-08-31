// PM2 permet de lancer PLUSIEURS instances du serveur (une par cœur CPU)
// et de répartir automatiquement les requêtes entre elles. C'est ce qui
// permet de vraiment monter en charge sur un serveur multi-cœurs, plutôt
// que de laisser un seul processus Node tout absorber.
//
// Utilisation en production : npx pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'plateforme-v1-backend',
      script: 'server.js',
      instances: 'max',       // une instance par cœur CPU disponible
      exec_mode: 'cluster',
      max_memory_restart: '400M', // redémarre l'instance si elle fuit en mémoire
      autorestart: true,
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
