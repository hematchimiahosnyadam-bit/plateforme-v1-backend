const jwt = require('jsonwebtoken');
require('dotenv').config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });

/**
 * Le token contient toujours le type de compte (super_admin | admin_entreprise)
 * et, pour un admin d'entreprise, l'id + le schéma de son entreprise.
 * C'est ce qui permet au middleware de router chaque requête vers le bon
 * schéma SANS jamais faire confiance à une valeur envoyée par le frontend.
 */
function genererToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function verifierToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { genererToken, verifierToken };
