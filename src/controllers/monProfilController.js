const { tenantQuery, query } = require('../config/db');

/**
 * Profil de l'admin actuellement connecté. Contrairement à la réponse de
 * connexion (qui ne renvoie pas l'email), cette route donne l'info
 * complète — nécessaire pour préremplir la page "Mon profil".
 */
async function obtenirMonProfil(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const utilisateur = await tenantQuery(
      schema,
      `SELECT id, nom, email, role, created_at FROM utilisateurs WHERE id = $1`,
      [req.auth.utilisateurId]
    );
    if (utilisateur.rows.length === 0) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable' });
    }

    // Le nom de l'entreprise n'est pas dans le schéma tenant (il vit dans
    // le schéma public) — petite requête complémentaire pour l'afficher.
    const entreprise = await query(`SELECT nom FROM entreprises WHERE id = $1`, [req.tenant.id]);

    res.json({ ...utilisateur.rows[0], entreprise: entreprise.rows[0]?.nom || null });
  } catch (err) {
    next(err);
  }
}

/**
 * Permet à l'admin de modifier son propre nom (et éventuellement son
 * email). Le changement de mot de passe n'est PAS proposé : aucune route
 * de ce type n'existe encore côté backend, donc pas inventée ici.
 */
async function modifierMonProfil(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const { nom, email } = req.body;

    if (!nom && !email) {
      return res.status(400).json({ erreur: 'Aucun champ à modifier' });
    }

    const affectations = [];
    const valeurs = [];
    if (nom) { valeurs.push(nom); affectations.push(`nom = $${valeurs.length}`); }
    if (email) { valeurs.push(email); affectations.push(`email = $${valeurs.length}`); }

    valeurs.push(req.auth.utilisateurId);
    const result = await tenantQuery(
      schema,
      `UPDATE utilisateurs SET ${affectations.join(', ')} WHERE id = $${valeurs.length}
       RETURNING id, nom, email, role, created_at`,
      valeurs
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erreur: 'Cet email est déjà utilisé' });
    }
    next(err);
  }
}

module.exports = { obtenirMonProfil, modifierMonProfil };
