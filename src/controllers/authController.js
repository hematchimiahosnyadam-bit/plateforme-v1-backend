const { query, tenantQuery } = require('../config/db');
const { comparePassword } = require('../utils/password');
const { genererToken } = require('../utils/jwt');
const { getEntrepriseBySlug } = require('../services/tenantService');

/**
 * Connexion Super Admin — compte global, schéma "public".
 */
async function connexionSuperAdmin(req, res, next) {
  try {
    const { email, motDePasse } = req.body;
    if (!email || !motDePasse) {
      return res.status(400).json({ erreur: 'Email et mot de passe requis' });
    }

    const result = await query('SELECT * FROM super_admins WHERE email = $1', [email]);
    const compte = result.rows[0];

    // Même message que le mot de passe soit faux ou le compte inexistant :
    // ça évite de révéler quels emails existent dans le système.
    if (!compte || !(await comparePassword(motDePasse, compte.mot_de_passe))) {
      return res.status(401).json({ erreur: 'Identifiants incorrects' });
    }

    const token = genererToken({ role: 'super_admin', superAdminId: compte.id });
    res.json({ token, nom: compte.nom });
  } catch (err) {
    next(err);
  }
}

/**
 * Connexion Admin d'entreprise — nécessite le slug de l'entreprise
 * (ex: dans l'URL /connexion/whisky-shop-ouaga) pour savoir dans quel
 * schéma chercher le compte.
 */
async function connexionAdminEntreprise(req, res, next) {
  try {
    const { slugEntreprise, email, motDePasse } = req.body;
    if (!slugEntreprise || !email || !motDePasse) {
      return res.status(400).json({ erreur: 'Champs manquants' });
    }

    const entreprise = await getEntrepriseBySlug(slugEntreprise);
    if (!entreprise || entreprise.statut !== 'actif') {
      return res.status(401).json({ erreur: 'Identifiants incorrects' });
    }

    const result = await tenantQuery(
      entreprise.schema_name,
      'SELECT * FROM utilisateurs WHERE email = $1 AND actif = true',
      [email]
    );
    const compte = result.rows[0];

    if (!compte || !(await comparePassword(motDePasse, compte.mot_de_passe))) {
      return res.status(401).json({ erreur: 'Identifiants incorrects' });
    }

    const token = genererToken({
      role: compte.role,
      utilisateurId: compte.id,
      entrepriseId: entreprise.id,
    });

    res.json({
      token,
      nom: compte.nom,
      role: compte.role,
      entreprise: entreprise.nom,
      fonctionnalitesActivees: entreprise.fonctionnalites_activees,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { connexionSuperAdmin, connexionAdminEntreprise };
