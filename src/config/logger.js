// Logs structurés (JSON) : indispensable en production pour retrouver
// une erreur précise dans des milliers de lignes, et pour brancher plus
// tard un outil de supervision (ex: Datadog, Grafana) sans tout réécrire.

const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? winston.format.json()
        : winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    new winston.transports.File({ filename: 'logs/erreurs.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combine.log' }),
  ],
});

module.exports = logger;
