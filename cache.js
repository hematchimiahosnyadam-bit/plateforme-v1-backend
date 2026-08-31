// Cache pour les lectures fréquentes et coûteuses (catalogue, catégories).
// Avec 10 000+ produits et beaucoup de visiteurs, on évite de retaper la
// base à chaque requête identique : on sert depuis la mémoire de Redis.
//
// Si REDIS_URL n'est pas configuré, le cache est simplement désactivé
// (l'app continue de fonctionner, juste sans accélération) — utile en
// développement sans avoir à installer Redis tout de suite.

const Redis = require('ioredis');
require('dotenv').config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });
const logger = require('./logger');

const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

if (redis) {
  redis.on('error', (err) => logger.warn('[Redis] erreur de connexion', { erreur: err.message }));
}

async function getCache(cle) {
  if (!redis) return null;
  try {
    const valeur = await redis.get(cle);
    return valeur ? JSON.parse(valeur) : null;
  } catch {
    return null; // en cas de souci Redis, on continue sans planter la requête
  }
}

async function setCache(cle, valeur, ttlSecondes = 60) {
  if (!redis) return;
  try {
    await redis.set(cle, JSON.stringify(valeur), 'EX', ttlSecondes);
  } catch {
    // on ignore : le cache est un bonus, jamais une dépendance critique
  }
}

/**
 * Invalide toutes les clés de cache d'une entreprise pour une ressource
 * donnée (ex: après création/modification d'un produit).
 */
async function invaliderCache(schema, ressource) {
  if (!redis) return;
  try {
    const cles = await redis.keys(`${schema}:${ressource}:*`);
    if (cles.length) await redis.del(...cles);
  } catch {
    // idem : on ne bloque jamais une requête pour un souci de cache
  }
}

module.exports = { getCache, setCache, invaliderCache };
