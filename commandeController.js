const { pool, tenantQuery } = require('../config/db');
const { calculerPanier, obtenirOuCreerPanier } = require('./panierController');
const { invaliderCache } = require('../config/cache');
const { notifierClient, notifierAdmins } = require('../services/notificationService');
const { getEntrepriseById } = require('../services/tenantService');
const { construireLienWhatsApp } = require('../utils/whatsapp');
const logger = require('../config/logger');

const STATUTS_VALIDES = ['en_attente', 'confirmee', 'en_preparation', 'expediee', 'livree', 'annulee'];

/**
 * Transforme le panier en commande. Tout se passe dans UNE transaction :
 * vérification du stock, décrément du stock, création de la commande et
 * de ses lignes. Si une étape échoue (ex: stock insuffisant sur un
 * article), rien n'est enregistré.
 */
async function creerCommande(req, res, next) {
  const schema = req.tenant.schema;
  const client = await pool.connect();

  try {
    const panier = await obtenirOuCreerPanier(schema, req.auth.clientId);
    const { articles, total } = await calculerPanier(schema, panier.id);

    if (articles.length === 0) {
      return res.status(400).json({ erreur: 'Le panier est vide' });
    }

    await client.query('BEGIN');
    await client.query(`SET search_path TO "${schema}"`);

    for (const article of articles) {
      // Décrément atomique : la condition "stock >= quantite" est vérifiée
      // par la base elle-même, dans la même opération que la mise à jour.
      // Ça empêche deux commandes simultanées de survendre le même article
      // (contrairement à un "lire le stock" puis "écrire" en deux étapes séparées).
      const table = article.varianteId ? 'produit_variantes' : 'produits';
      const colonneStock = article.varianteId ? 'stock' : 'quantite_stock';
      const idCible = article.varianteId || article.produitId;

      const miseAJour = await client.query(
        `UPDATE ${table} SET ${colonneStock} = ${colonneStock} - $1
         WHERE id = $2 AND ${colonneStock} >= $1
         RETURNING id`,
        [article.quantite, idCible]
      );

      if (miseAJour.rows.length === 0) {
        throw Object.assign(new Error(`Stock insuffisant pour "${article.nom}"`), { statut: 409 });
      }
    }

    const commandeResult = await client.query(
      `INSERT INTO commandes (client_id, statut, total, code_promo)
       VALUES ($1, 'en_attente', $2, $3) RETURNING *`,
      [req.auth.clientId, total, panier.code_promo || null]
    );
    const commande = commandeResult.rows[0];

    for (const article of articles) {
      await client.query(
        `INSERT INTO commande_lignes (commande_id, produit_id, variante_id, quantite, prix_unitaire)
         VALUES ($1,$2,$3,$4,$5)`,
        [commande.id, article.produitId, article.varianteId, article.quantite, article.prixUnitaire]
      );
    }

    await client.query(`DELETE FROM panier_lignes WHERE panier_id = $1`, [panier.id]);

    await client.query('COMMIT');
    await invaliderCache(schema, 'produits'); // le stock a changé, le catalogue en cache est périmé

    // Notifications best-effort : un souci ici ne doit jamais faire échouer
    // une commande déjà validée et payée en base.
    try {
      await notifierAdmins(schema, 'commande_creee', `Nouvelle commande #${commande.id} (${total} FCFA)`, `/commandes/${commande.id}`);
      await notifierClient(schema, req.auth.clientId, 'commande_creee', `Ta commande #${commande.id} a été enregistrée`, `/commandes/${commande.id}`);

      for (const article of articles) {
        const stockRestant = article.varianteId
          ? (await tenantQuery(schema, `SELECT stock FROM produit_variantes WHERE id = $1`, [article.varianteId])).rows[0]?.stock
          : (await tenantQuery(schema, `SELECT quantite_stock FROM produits WHERE id = $1`, [article.produitId])).rows[0]?.quantite_stock;

        if (stockRestant !== undefined && stockRestant <= 5) {
          await notifierAdmins(schema, 'stock_faible', `Stock faible pour "${article.nom}" (${stockRestant} restant(s))`, `/produits/${article.produitId}`);
        }
      }
    } catch (err) {
      logger.warn('[notifications] échec non bloquant', { erreur: err.message });
    }

    // Construit le lien WhatsApp prérempli pour que le client puisse envoyer
    // sa commande directement à la boutique en un clic.
    let lienWhatsApp = null;
    try {
      const entreprise = await getEntrepriseById(req.tenant.id);
      const clientInfo = await tenantQuery(schema, `SELECT nom FROM clients WHERE id = $1`, [req.auth.clientId]);
      lienWhatsApp = construireLienWhatsApp(
        entreprise?.numero_whatsapp,
        commande,
        articles,
        clientInfo.rows[0]?.nom
      );
    } catch (err) {
      logger.warn('[whatsapp] échec non bloquant de la génération du lien', { erreur: err.message });
    }

    res.status(201).json({ ...commande, articles, lienWhatsApp });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    await client.query('SET search_path TO public');
    client.release();
  }
}

async function listerMesCommandes(req, res, next) {
  try {
    const result = await tenantQuery(
      req.tenant.schema,
      `SELECT id, statut, total, created_at FROM commandes
       WHERE client_id = $1 ORDER BY created_at DESC`,
      [req.auth.clientId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

async function obtenirCommande(req, res, next) {
  try {
    const schema = req.tenant.schema;
    // Un client ne peut voir que ses propres commandes ; un admin peut tout voir.
    const estAdmin = ['admin', 'gestionnaire_commandes'].includes(req.auth.role);

    const commande = await tenantQuery(
      schema,
      estAdmin
        ? `SELECT c.*, cl.nom AS client_nom, cl.email AS client_email, cl.telephone AS client_telephone
           FROM commandes c
           LEFT JOIN clients cl ON cl.id = c.client_id
           WHERE c.id = $1`
        : `SELECT * FROM commandes WHERE id = $1 AND client_id = $2`,
      estAdmin ? [req.params.id] : [req.params.id, req.auth.clientId]
    );
    if (commande.rows.length === 0) {
      return res.status(404).json({ erreur: 'Commande introuvable' });
    }

    const lignes = await tenantQuery(
      schema,
      `SELECT cl.*, p.nom AS produit_nom,
              (SELECT url FROM produit_images WHERE produit_id = p.id ORDER BY ordre ASC LIMIT 1) AS produit_image
       FROM commande_lignes cl
       JOIN produits p ON p.id = cl.produit_id
       WHERE cl.commande_id = $1`,
      [req.params.id]
    );

    res.json({ ...commande.rows[0], lignes: lignes.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Réservé aux admins. Changement de statut avec liste blanche stricte —
 * empêche d'écrire n'importe quelle chaîne dans la colonne statut.
 */
async function modifierStatutCommande(req, res, next) {
  try {
    const { statut } = req.body;
    if (!STATUTS_VALIDES.includes(statut)) {
      return res.status(400).json({ erreur: 'Statut invalide' });
    }

    const result = await tenantQuery(
      req.tenant.schema,
      `UPDATE commandes SET statut = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [statut, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Commande introuvable' });
    }

    const commande = result.rows[0];
    const messagesParStatut = {
      confirmee: 'a été confirmée',
      en_preparation: 'est en cours de préparation',
      expediee: 'a été expédiée',
      livree: 'a été livrée',
      annulee: 'a été annulée',
    };
    if (commande.client_id && messagesParStatut[statut]) {
      try {
        await notifierClient(
          req.tenant.schema,
          commande.client_id,
          'commande_statut',
          `Ta commande #${commande.id} ${messagesParStatut[statut]}`,
          `/commandes/${commande.id}`
        );
      } catch (err) {
        logger.warn('[notifications] échec non bloquant', { erreur: err.message });
      }
    }

    res.json(commande);
  } catch (err) {
    next(err);
  }
}

async function listerToutesLesCommandes(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limite = Math.min(parseInt(req.query.limite, 10) || 30, 60);
    const offset = (page - 1) * limite;

    const conditions = [];
    const valeurs = [];
    if (req.query.statut) {
      valeurs.push(req.query.statut);
      conditions.push(`c.statut = $${valeurs.length}`);
    }
    if (req.query.recherche) {
      const recherche = req.query.recherche.trim();
      // Une recherche purement numérique cible le numéro de commande,
      // sinon on cherche dans le nom du client (insensible à la casse).
      if (/^\d+$/.test(recherche)) {
        valeurs.push(Number(recherche));
        conditions.push(`c.id = $${valeurs.length}`);
      } else {
        valeurs.push(`%${recherche}%`);
        conditions.push(`cl.nom ILIKE $${valeurs.length}`);
      }
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const triAutorises = {
      recent: 'c.created_at DESC',
      ancien: 'c.created_at ASC',
      montant_desc: 'c.total DESC',
      montant_asc: 'c.total ASC',
    };
    const tri = triAutorises[req.query.tri] || 'c.created_at DESC';

    const [result, total] = await Promise.all([
      tenantQuery(
        req.tenant.schema,
        `SELECT c.id, c.client_id, c.statut, c.total, c.created_at,
                cl.nom AS client_nom
         FROM commandes c
         LEFT JOIN clients cl ON cl.id = c.client_id
         ${whereClause} ORDER BY ${tri} LIMIT $${valeurs.length + 1} OFFSET $${valeurs.length + 2}`,
        [...valeurs, limite, offset]
      ),
      tenantQuery(
        req.tenant.schema,
        `SELECT COUNT(*)::int AS total FROM commandes c
         LEFT JOIN clients cl ON cl.id = c.client_id
         ${whereClause}`,
        valeurs
      ),
    ]);

    res.json({ page, limite, total: total.rows[0].total, commandes: result.rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  creerCommande,
  listerMesCommandes,
  obtenirCommande,
  modifierStatutCommande,
  listerToutesLesCommandes,
};
