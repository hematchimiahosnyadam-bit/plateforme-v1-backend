const { query, tenantQuery } = require('../config/db');
const { creerEntreprise } = require('../services/tenantService');
const { hashPassword } = require('../utils/password');

/**
 * Crée une entreprise + son premier compte admin.
 * Réservé au Super Admin (voir routes).
 */
async function creerNouvelleEntreprise(req, res, next) {
  try {
    const { nom, slug, adminEmail, adminMotDePasse, adminNom, numeroWhatsapp, fonctionnalitesActivees } = req.body;
    if (!nom || !slug || !adminEmail || !adminMotDePasse || !adminNom) {
      return res.status(400).json({ erreur: 'Champs manquants' });
    }

    const entreprise = await creerEntreprise({ nom, slug, numeroWhatsapp, fonctionnalitesActivees });

    const motDePasseHache = await hashPassword(adminMotDePasse);
    await tenantQuery(
      entreprise.schemaName,
      `INSERT INTO utilisateurs (email, mot_de_passe, nom, role)
       VALUES ($1, $2, $3, 'admin')`,
      [adminEmail, motDePasseHache, adminNom]
    );

    res.status(201).json({
      id: entreprise.id,
      nom: entreprise.nom,
      slug: entreprise.slug,
    });
  } catch (err) {
    if (err.code === '23505') { // violation de contrainte unique (slug déjà pris)
      return res.status(409).json({ erreur: 'Ce slug est déjà utilisé' });
    }
    next(err);
  }
}

async function listerEntreprises(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limite = 20;
    const offset = (page - 1) * limite;

    const conditions = [];
    const valeurs = [];
    if (req.query.recherche) {
      valeurs.push(`%${req.query.recherche.trim()}%`);
      conditions.push(`nom ILIKE $${valeurs.length}`);
    }
    if (req.query.statut) {
      valeurs.push(req.query.statut);
      conditions.push(`statut = $${valeurs.length}`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [result, total] = await Promise.all([
      query(
        `SELECT id, nom, slug, statut, created_at
         FROM entreprises
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${valeurs.length + 1} OFFSET $${valeurs.length + 2}`,
        [...valeurs, limite, offset]
      ),
      query(`SELECT COUNT(*)::int AS total FROM entreprises ${whereClause}`, valeurs),
    ]);

    res.json({ page, limite, total: total.rows[0].total, entreprises: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Détail d'une entreprise pour le Super Admin, y compris ses comptes admin
 * (mais jamais les mots de passe hachés — jamais renvoyés, même hachés).
 */
async function obtenirEntreprise(req, res, next) {
  try {
    const entreprise = await query(
      `SELECT id, nom, slug, schema_name, numero_whatsapp, statut, fonctionnalites_activees, created_at
       FROM entreprises WHERE id = $1`,
      [req.params.id]
    );
    if (entreprise.rows.length === 0) {
      return res.status(404).json({ erreur: 'Entreprise introuvable' });
    }

    const utilisateurs = await tenantQuery(
      entreprise.rows[0].schema_name,
      `SELECT id, nom, email, role, actif, created_at FROM utilisateurs ORDER BY created_at ASC`
    );

    res.json({ ...entreprise.rows[0], utilisateurs: utilisateurs.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Change le statut d'une entreprise : suspendre (coupe l'accès admin ET
 * boutique publique immédiatement, voir tenant.js/publicTenant.js),
 * réactiver, ou archiver.
 *
 * "Supprimer" une entreprise dans l'interface correspond à ce statut
 * 'archive', PAS à une suppression physique des données (DROP SCHEMA) :
 * pour une plateforme e-commerce avec de vraies commandes clients,
 * détruire irréversiblement des données au clic d'un bouton est trop
 * risqué. L'archivage retire l'entreprise de la liste active et bloque
 * tout accès, en gardant la possibilité de revenir en arrière.
 */
async function modifierStatutEntreprise(req, res, next) {
  try {
    const { statut } = req.body;
    if (!['actif', 'suspendu', 'archive'].includes(statut)) {
      return res.status(400).json({ erreur: 'Statut invalide' });
    }

    const result = await query(
      `UPDATE entreprises SET statut = $1, updated_at = now() WHERE id = $2
       RETURNING id, nom, slug, statut`,
      [statut, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Entreprise introuvable' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

const MODULES_VALIDES_CTRL = [
  'commandes', 'produits', 'categories', 'ma_boutique',
  'clients', 'promotions', 'analytics', 'contenu_site', 'mediatheque',
];

/**
 * Change la liste des modules activés pour une entreprise — c'est ainsi
 * que le Super Admin choisit ses "widgets" après la création (en plus du
 * choix initial fait à la création).
 */
async function modifierFonctionnalitesEntreprise(req, res, next) {
  try {
    const { fonctionnalitesActivees } = req.body;
    if (!Array.isArray(fonctionnalitesActivees)) {
      return res.status(400).json({ erreur: 'fonctionnalitesActivees doit être une liste' });
    }
    const modules = fonctionnalitesActivees.filter((m) => MODULES_VALIDES_CTRL.includes(m));

    const result = await query(
      `UPDATE entreprises SET fonctionnalites_activees = $1, updated_at = now() WHERE id = $2
       RETURNING id, nom, slug, fonctionnalites_activees`,
      [modules, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Entreprise introuvable' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function obtenirSchemaEntreprise(id) {
  const result = await query(`SELECT schema_name FROM entreprises WHERE id = $1`, [id]);
  return result.rows[0]?.schema_name || null;
}

/**
 * Liste les comptes admin/gestionnaires d'une entreprise précise.
 */
async function listerAdminsEntreprise(req, res, next) {
  try {
    const schema = await obtenirSchemaEntreprise(req.params.id);
    if (!schema) return res.status(404).json({ erreur: 'Entreprise introuvable' });

    const result = await tenantQuery(
      schema,
      `SELECT id, nom, email, role, actif, created_at FROM utilisateurs ORDER BY created_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * Crée un nouveau compte admin/gestionnaire pour une entreprise précise
 * — c'est ainsi que le Super Admin définit qui a accès au dashboard
 * d'une entreprise et avec quel rôle.
 */
async function creerAdminEntreprise(req, res, next) {
  try {
    const schema = await obtenirSchemaEntreprise(req.params.id);
    if (!schema) return res.status(404).json({ erreur: 'Entreprise introuvable' });

    const { nom, email, motDePasse, role } = req.body;
    if (!nom || !email || !motDePasse || !role) {
      return res.status(400).json({ erreur: 'Champs manquants' });
    }
    if (!['admin', 'gestionnaire_produits', 'gestionnaire_commandes'].includes(role)) {
      return res.status(400).json({ erreur: 'Rôle invalide' });
    }

    const motDePasseHache = await hashPassword(motDePasse);
    const result = await tenantQuery(
      schema,
      `INSERT INTO utilisateurs (email, mot_de_passe, nom, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nom, email, role, actif, created_at`,
      [email, motDePasseHache, nom, role]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erreur: 'Cet email est déjà utilisé' });
    }
    next(err);
  }
}

/**
 * Modifie le rôle ou l'état actif/inactif d'un compte admin d'une
 * entreprise. Un compte désactivé (actif=false) ne peut plus se
 * connecter (voir authController, qui filtre WHERE actif = true).
 */
async function modifierAdminEntreprise(req, res, next) {
  try {
    const schema = await obtenirSchemaEntreprise(req.params.id);
    if (!schema) return res.status(404).json({ erreur: 'Entreprise introuvable' });

    const { role, actif } = req.body;
    if (role && !['admin', 'gestionnaire_produits', 'gestionnaire_commandes'].includes(role)) {
      return res.status(400).json({ erreur: 'Rôle invalide' });
    }

    const affectations = [];
    const valeurs = [];
    if ('role' in req.body) { valeurs.push(role); affectations.push(`role = $${valeurs.length}`); }
    if ('actif' in req.body) { valeurs.push(actif); affectations.push(`actif = $${valeurs.length}`); }
    if (affectations.length === 0) {
      return res.status(400).json({ erreur: 'Aucun champ à modifier' });
    }

    valeurs.push(req.params.userId);
    const result = await tenantQuery(
      schema,
      `UPDATE utilisateurs SET ${affectations.join(', ')} WHERE id = $${valeurs.length}
       RETURNING id, nom, email, role, actif, created_at`,
      valeurs
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
 * Supprime un compte admin. Protection : impossible de supprimer le
 * dernier compte actif avec le rôle 'admin' d'une entreprise — sinon
 * plus personne ne pourrait gérer cette entreprise.
 */
async function supprimerAdminEntreprise(req, res, next) {
  try {
    const schema = await obtenirSchemaEntreprise(req.params.id);
    if (!schema) return res.status(404).json({ erreur: 'Entreprise introuvable' });

    const comptesAdmin = await tenantQuery(
      schema,
      `SELECT id FROM utilisateurs WHERE role = 'admin' AND actif = true`
    );
    const cibleEstDernierAdmin = comptesAdmin.rows.length === 1 && String(comptesAdmin.rows[0].id) === String(req.params.userId);
    if (cibleEstDernierAdmin) {
      return res.status(400).json({ erreur: 'Impossible de supprimer le dernier administrateur actif de cette entreprise' });
    }

    const result = await tenantQuery(schema, `DELETE FROM utilisateurs WHERE id = $1 RETURNING id`, [req.params.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Compte introuvable' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * Retourne les informations de SA propre entreprise (contact, identité).
 * req.tenant.id vient du token — un admin ne peut jamais lire les
 * informations d'une autre entreprise.
 */
async function obtenirMonEntreprise(req, res, next) {
  try {
    const result = await query(
      `SELECT id, nom, slug, description, email, telephone, adresse,
              horaires, logo_url, facebook_url, instagram_url, numero_whatsapp
       FROM entreprises WHERE id = $1`,
      [req.tenant.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Entreprise introuvable' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * Permet à un admin de mettre à jour les paramètres de SA propre entreprise.
 * Seuls les champs explicitement présents dans le corps de la requête sont
 * modifiés (voir contenuController.modifierContenu pour la même logique) —
 * ça évite qu'un champ omis soit écrasé, et permet de vider un champ
 * volontairement en envoyant une chaîne vide.
 */
async function modifierMonEntreprise(req, res, next) {
  try {
    const corps = req.body;
    const colonnes = {
      numeroWhatsapp: 'numero_whatsapp',
      description: 'description',
      email: 'email',
      telephone: 'telephone',
      adresse: 'adresse',
      horaires: 'horaires',
      logoUrl: 'logo_url',
      facebookUrl: 'facebook_url',
      instagramUrl: 'instagram_url',
    };

    const affectations = [];
    const valeurs = [];
    for (const [cleCorps, colonneSql] of Object.entries(colonnes)) {
      if (cleCorps in corps) {
        valeurs.push(corps[cleCorps]);
        affectations.push(`${colonneSql} = $${valeurs.length}`);
      }
    }

    if (affectations.length === 0) {
      return res.status(400).json({ erreur: 'Aucun champ à modifier' });
    }

    valeurs.push(req.tenant.id);
    const result = await query(
      `UPDATE entreprises SET ${affectations.join(', ')}, updated_at = now()
       WHERE id = $${valeurs.length}
       RETURNING id, nom, slug, description, email, telephone, adresse,
                 horaires, logo_url, facebook_url, instagram_url, numero_whatsapp`,
      valeurs
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * Infos publiques de l'entreprise pour la boutique publique (page
 * "Notre boutique", footer, etc.) — jamais schema_name ni aucun champ
 * interne, seulement ce qu'un visiteur peut légitimement voir.
 */
async function obtenirInfosPubliquesEntreprise(req, res, next) {
  try {
    const result = await query(
      `SELECT nom, description, email, telephone, adresse, horaires,
              logo_url, facebook_url, instagram_url, numero_whatsapp
       FROM entreprises WHERE id = $1`,
      [req.tenant.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Boutique introuvable' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  creerNouvelleEntreprise,
  listerEntreprises,
  obtenirEntreprise,
  modifierStatutEntreprise,
  modifierFonctionnalitesEntreprise,
  listerAdminsEntreprise,
  creerAdminEntreprise,
  modifierAdminEntreprise,
  supprimerAdminEntreprise,
  obtenirMonEntreprise,
  modifierMonEntreprise,
  obtenirInfosPubliquesEntreprise,
};
