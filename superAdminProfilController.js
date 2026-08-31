const { query } = require('../config/db');

/**
 * Profil du Super Admin actuellement connecté. Contrairement à la
 * réponse de connexion (qui ne renvoie pas l'email), cette route donne
 * l'info complète — nécessaire pour préremplir "Mon profil".
 */
async function obtenirMonProfilSuperAdmin(req, res, next) {
  try {
    const result = await query(
      `SELECT id, nom, email, created_at FROM super_admins WHERE id = $1`,
      [req.auth.superAdminId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Compte introuvable' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * Modifie le nom et/ou l'email du Super Admin connecté. Le changement de
 * mot de passe n'est PAS proposé : aucune route de ce type n'existe côté
 * backend (même limite que pour l'admin entreprise), donc pas inventée ici.
 */
async function modifierMonProfilSuperAdmin(req, res, next) {
  try {
    const { nom, email } = req.body;
    if (!nom && !email) {
      return res.status(400).json({ erreur: 'Aucun champ à modifier' });
    }

    const affectations = [];
    const valeurs = [];
    if (nom) { valeurs.push(nom); affectations.push(`nom = $${valeurs.length}`); }
    if (email) { valeurs.push(email); affectations.push(`email = $${valeurs.length}`); }

    valeurs.push(req.auth.superAdminId);
    const result = await query(
      `UPDATE super_admins SET ${affectations.join(', ')} WHERE id = $${valeurs.length}
       RETURNING id, nom, email, created_at`,
      valeurs
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Compte introuvable' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erreur: 'Cet email est déjà utilisé' });
    }
    next(err);
  }
}

module.exports = { obtenirMonProfilSuperAdmin, modifierMonProfilSuperAdmin };
