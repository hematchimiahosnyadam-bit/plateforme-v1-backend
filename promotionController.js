const { tenantQuery } = require('../config/db');

async function creerPromotion(req, res, next) {
  try {
    const { code, type, valeur, dateDebut, dateFin } = req.body;
    if (!type || valeur === undefined || !dateDebut || !dateFin) {
      return res.status(400).json({ erreur: 'type, valeur, dateDebut et dateFin sont obligatoires' });
    }
    if (!['pourcentage', 'montant_fixe'].includes(type)) {
      return res.status(400).json({ erreur: 'type doit être "pourcentage" ou "montant_fixe"' });
    }
    if (type === 'pourcentage' && (valeur <= 0 || valeur > 100)) {
      return res.status(400).json({ erreur: 'Un pourcentage doit être entre 1 et 100' });
    }
    if (new Date(dateFin) <= new Date(dateDebut)) {
      return res.status(400).json({ erreur: 'dateFin doit être après dateDebut' });
    }

    const result = await tenantQuery(
      req.tenant.schema,
      `INSERT INTO promotions (code, type, valeur, date_debut, date_fin)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [code || null, type, valeur, dateDebut, dateFin]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erreur: 'Ce code promo existe déjà' });
    }
    next(err);
  }
}

async function listerPromotions(req, res, next) {
  try {
    const result = await tenantQuery(
      req.tenant.schema,
      `SELECT * FROM promotions ORDER BY date_debut DESC`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * Modifie une promotion. Seuls les champs présents dans le corps de la
 * requête sont mis à jour (même logique que contenuController) — permet
 * de juste activer/désactiver SANS renvoyer tous les autres champs, ou de
 * modifier le code/montant/dates en une seule fois.
 */
async function modifierPromotion(req, res, next) {
  try {
    const corps = req.body;

    if ('type' in corps && !['pourcentage', 'montant_fixe'].includes(corps.type)) {
      return res.status(400).json({ erreur: 'type doit être "pourcentage" ou "montant_fixe"' });
    }
    if ('valeur' in corps && corps.type === 'pourcentage' && (corps.valeur <= 0 || corps.valeur > 100)) {
      return res.status(400).json({ erreur: 'Un pourcentage doit être entre 1 et 100' });
    }
    if ('dateDebut' in corps && 'dateFin' in corps && new Date(corps.dateFin) <= new Date(corps.dateDebut)) {
      return res.status(400).json({ erreur: 'dateFin doit être après dateDebut' });
    }

    const colonnes = {
      code: 'code',
      type: 'type',
      valeur: 'valeur',
      dateDebut: 'date_debut',
      dateFin: 'date_fin',
      actif: 'actif',
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

    valeurs.push(req.params.id);
    const result = await tenantQuery(
      req.tenant.schema,
      `UPDATE promotions SET ${affectations.join(', ')} WHERE id = $${valeurs.length} RETURNING *`,
      valeurs
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Promotion introuvable' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erreur: 'Ce code promo existe déjà' });
    }
    next(err);
  }
}

async function supprimerPromotion(req, res, next) {
  try {
    const result = await tenantQuery(
      req.tenant.schema,
      `DELETE FROM promotions WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Promotion introuvable' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

/**
 * Applique un code promo au panier du client connecté.
 * La validité (dates, actif) est toujours revérifiée côté serveur au
 * moment de l'application ET au moment de la commande.
 */
async function appliquerCodePromo(req, res, next) {
  try {
    if (req.auth.role !== 'client') {
      return res.status(403).json({ erreur: 'Seul un client peut appliquer un code promo à son panier' });
    }

    const { code } = req.body;
    if (!code) return res.status(400).json({ erreur: 'Code requis' });

    const schema = req.tenant.schema;
    const promo = await tenantQuery(
      schema,
      `SELECT * FROM promotions
       WHERE code = $1 AND actif = true AND now() BETWEEN date_debut AND date_fin`,
      [code]
    );
    if (promo.rows.length === 0) {
      return res.status(404).json({ erreur: 'Code promo invalide ou expiré' });
    }

    await tenantQuery(
      schema,
      `UPDATE paniers SET code_promo = $1, updated_at = now() WHERE client_id = $2`,
      [code, req.auth.clientId]
    );

    res.json({ message: 'Code promo appliqué', promotion: promo.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  creerPromotion,
  listerPromotions,
  modifierPromotion,
  supprimerPromotion,
  appliquerCodePromo,
};
