const { tenantQuery } = require('../config/db');
const { hashPassword, comparePassword } = require('../utils/password');
const { genererToken } = require('../utils/jwt');
const { OAuth2Client } = require('google-auth-library');

const clientGoogle = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Inscription d'un client sur la boutique d'une entreprise.
 * req.tenant est déjà résolu par resoudreTenantPublic (via le slug dans l'URL).
 */
async function inscriptionClient(req, res, next) {
  try {
    const { email, motDePasse, nom, telephone } = req.body;
    if (!email || !motDePasse || !nom) {
      return res.status(400).json({ erreur: 'Email, mot de passe et nom sont obligatoires' });
    }
    if (motDePasse.length < 8) {
      return res.status(400).json({ erreur: 'Le mot de passe doit contenir au moins 8 caractères' });
    }

    const hash = await hashPassword(motDePasse);
    const result = await tenantQuery(
      req.tenant.schema,
      `INSERT INTO clients (email, mot_de_passe, nom, telephone)
       VALUES ($1,$2,$3,$4) RETURNING id, email, nom`,
      [email, hash, nom, telephone || null]
    );

    const client = result.rows[0];
    const token = genererToken({ role: 'client', clientId: client.id, entrepriseId: req.tenant.id });
    res.status(201).json({ token, client });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erreur: 'Un compte existe déjà avec cet email' });
    }
    next(err);
  }
}

async function connexionClient(req, res, next) {
  try {
    const { email, motDePasse } = req.body;
    if (!email || !motDePasse) {
      return res.status(400).json({ erreur: 'Email et mot de passe requis' });
    }

    const result = await tenantQuery(
      req.tenant.schema,
      `SELECT * FROM clients WHERE email = $1`,
      [email]
    );
    const client = result.rows[0];

    if (!client || !client.mot_de_passe || !(await comparePassword(motDePasse, client.mot_de_passe))) {
      return res.status(401).json({ erreur: 'Identifiants incorrects' });
    }

    const token = genererToken({ role: 'client', clientId: client.id, entrepriseId: req.tenant.id });
    res.json({ token, client: { id: client.id, email: client.email, nom: client.nom } });
  } catch (err) {
    next(err);
  }
}

/**
 * Connexion/inscription via Google. Le frontend récupère un "idToken" via
 * le bouton Google Sign-In, on le vérifie ici côté serveur (jamais confiance
 * en un email envoyé directement par le frontend — seul le token signé par
 * Google fait foi). Si le compte n'existe pas encore pour cette boutique,
 * il est créé automatiquement (inscription silencieuse).
 */
async function connexionGoogleClient(req, res, next) {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ erreur: 'idToken requis' });
    }
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ erreur: 'Connexion Google non configurée sur ce serveur' });
    }

    let payload;
    try {
      const ticket = await clientGoogle.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ erreur: 'Token Google invalide' });
    }

    const schema = req.tenant.schema;
    const { sub: googleId, email, name } = payload;

    // Cherche d'abord par google_id, puis par email (cas où le compte existait déjà en local).
    let result = await tenantQuery(schema, `SELECT * FROM clients WHERE google_id = $1`, [googleId]);
    if (result.rows.length === 0) {
      result = await tenantQuery(schema, `SELECT * FROM clients WHERE email = $1`, [email]);
    }

    let client;
    if (result.rows.length > 0) {
      client = result.rows[0];
      if (!client.google_id) {
        // Compte local existant avec le même email : on le relie à Google.
        await tenantQuery(schema, `UPDATE clients SET google_id = $1 WHERE id = $2`, [googleId, client.id]);
      }
    } else {
      const cree = await tenantQuery(
        schema,
        `INSERT INTO clients (email, google_id, nom) VALUES ($1,$2,$3) RETURNING *`,
        [email, googleId, name || email]
      );
      client = cree.rows[0];
    }

    const token = genererToken({ role: 'client', clientId: client.id, entrepriseId: req.tenant.id });
    res.json({ token, client: { id: client.id, email: client.email, nom: client.nom } });
  } catch (err) {
    next(err);
  }
}

module.exports = { inscriptionClient, connexionClient, connexionGoogleClient };
