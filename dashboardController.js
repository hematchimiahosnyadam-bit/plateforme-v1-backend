const { query, tenantQuery } = require('../config/db');

/**
 * Vue d'ensemble pour le Super Admin. Une seule requête groupée plutôt
 * que plusieurs allers-retours — indispensable pour rester rapide même
 * avec des centaines d'entreprises.
 */
async function statsSuperAdmin(req, res, next) {
  try {
    const [stats, dernieres] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::int AS total_entreprises,
          COUNT(*) FILTER (WHERE statut = 'actif')::int AS entreprises_actives,
          COUNT(*) FILTER (WHERE statut = 'suspendu')::int AS entreprises_suspendues,
          COUNT(*) FILTER (WHERE statut = 'archive')::int AS entreprises_archivees,
          COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS nouvelles_ce_mois
        FROM entreprises
      `),
      query(`
        SELECT id, nom, slug, statut, created_at
        FROM entreprises
        ORDER BY created_at DESC
        LIMIT 5
      `),
    ]);
    res.json({ ...stats.rows[0], dernieres_entreprises: dernieres.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Statistiques d'une entreprise précise (CA, commandes, alertes stock,
 * produits populaires). Calculées directement en base, jamais en
 * chargeant toutes les lignes pour les additionner côté serveur Node.
 */
async function statsEntreprise(req, res, next) {
  try {
    const schema = req.tenant.schema;

    const [ventes, commandesParStatut, stockFaible, produitsPopulaires, totalClients, totalProduits] = await Promise.all([
      tenantQuery(schema, `
        SELECT
          COALESCE(SUM(total), 0)::numeric AS chiffre_affaires_total,
          COALESCE(SUM(total) FILTER (WHERE created_at > now() - interval '30 days'), 0)::numeric AS chiffre_affaires_30j,
          COUNT(*)::int AS total_commandes,
          COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS commandes_30j
        FROM commandes
        WHERE statut != 'annulee'
      `),
      tenantQuery(schema, `
        SELECT statut, COUNT(*)::int AS total
        FROM commandes GROUP BY statut
      `),
      tenantQuery(schema, `
        SELECT id, nom, quantite_stock
        FROM produits
        WHERE quantite_stock <= 5 AND statut != 'masque'
        ORDER BY quantite_stock ASC
        LIMIT 10
      `),
      tenantQuery(schema, `
        SELECT p.id, p.nom, SUM(cl.quantite)::int AS unites_vendues
        FROM commande_lignes cl
        JOIN produits p ON p.id = cl.produit_id
        JOIN commandes c ON c.id = cl.commande_id
        WHERE c.statut != 'annulee'
        GROUP BY p.id, p.nom
        ORDER BY unites_vendues DESC
        LIMIT 5
      `),
      tenantQuery(schema, `
        SELECT
          COUNT(*)::int AS total_clients,
          COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS clients_30j
        FROM clients
      `),
      tenantQuery(schema, `
        SELECT COUNT(*)::int AS total_produits
        FROM produits WHERE statut != 'masque'
      `),
    ]);

    res.json({
      ...ventes.rows[0],
      ...totalClients.rows[0],
      ...totalProduits.rows[0],
      commandes_par_statut: commandesParStatut.rows,
      alertes_stock: stockFaible.rows,
      produits_populaires: produitsPopulaires.rows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Statistiques complémentaires pour la page Analytics — n'affiche que des
 * données réellement calculables à partir des tables existantes : pas de
 * série temporelle (le backend ne trace pas l'historique jour par jour),
 * pas de trafic/visiteurs (aucun tracking en place).
 */
async function statsAnalytics(req, res, next) {
  try {
    const schema = req.tenant.schema;

    const [paniers, categoriesPopulaires, produitsTop] = await Promise.all([
      tenantQuery(schema, `
        SELECT
          COUNT(*)::int AS total_commandes,
          COALESCE(SUM(total), 0)::numeric AS chiffre_affaires_total,
          COALESCE(AVG(total), 0)::numeric AS panier_moyen
        FROM commandes WHERE statut != 'annulee'
      `),
      tenantQuery(schema, `
        SELECT cat.id, cat.nom,
               SUM(cl.quantite * cl.prix_unitaire)::numeric AS chiffre_affaires,
               SUM(cl.quantite)::int AS unites_vendues
        FROM commande_lignes cl
        JOIN produits p ON p.id = cl.produit_id
        JOIN commandes c ON c.id = cl.commande_id
        JOIN categories cat ON cat.id = p.categorie_id
        WHERE c.statut != 'annulee'
        GROUP BY cat.id, cat.nom
        ORDER BY chiffre_affaires DESC
        LIMIT 5
      `),
      tenantQuery(schema, `
        SELECT p.id, p.nom,
               SUM(cl.quantite)::int AS unites_vendues,
               SUM(cl.quantite * cl.prix_unitaire)::numeric AS chiffre_affaires
        FROM commande_lignes cl
        JOIN produits p ON p.id = cl.produit_id
        JOIN commandes c ON c.id = cl.commande_id
        WHERE c.statut != 'annulee'
        GROUP BY p.id, p.nom
        ORDER BY chiffre_affaires DESC
        LIMIT 10
      `),
    ]);

    res.json({
      ...paniers.rows[0],
      categories_populaires: categoriesPopulaires.rows,
      produits_top: produitsTop.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { statsSuperAdmin, statsEntreprise, statsAnalytics };
