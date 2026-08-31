const { tenantQuery } = require('../config/db');

/**
 * Le panier est toujours reconstitué à partir de la base : les prix
 * et le stock affichés viennent de la table produits en direct, jamais
 * de ce que le frontend a pu stocker localement.
 */
async function obtenirOuCreerPanier(schema, clientId) {
  const existant = await tenantQuery(schema, `SELECT * FROM paniers WHERE client_id = $1`, [clientId]);
  if (existant.rows.length > 0) return existant.rows[0];

  const cree = await tenantQuery(
    schema,
    `INSERT INTO paniers (client_id) VALUES ($1) RETURNING *`,
    [clientId]
  );
  return cree.rows[0];
}

async function calculerPanier(schema, panierId) {
  const lignes = await tenantQuery(
    schema,
    `SELECT
       pl.id, pl.quantite, pl.produit_id, pl.variante_id,
       p.nom, p.prix, p.quantite_stock, p.statut,
       v.nom AS variante_nom, v.valeur AS variante_valeur, v.prix_supplement, v.stock AS variante_stock
     FROM panier_lignes pl
     JOIN produits p ON p.id = pl.produit_id
     LEFT JOIN produit_variantes v ON v.id = pl.variante_id
     WHERE pl.panier_id = $1
     ORDER BY pl.id`,
    [panierId]
  );

  let total = 0;
  const articles = lignes.rows.map((ligne) => {
    const prixUnitaire = Number(ligne.prix) + Number(ligne.prix_supplement || 0);
    const sousTotal = prixUnitaire * ligne.quantite;
    total += sousTotal;
    return {
      ligneId: ligne.id,
      produitId: ligne.produit_id,
      varianteId: ligne.variante_id,
      nom: ligne.nom,
      variante: ligne.variante_id ? `${ligne.variante_nom}: ${ligne.variante_valeur}` : null,
      prixUnitaire,
      quantite: ligne.quantite,
      sousTotal,
      stockDisponible: ligne.variante_id ? ligne.variante_stock : ligne.quantite_stock,
      statutProduit: ligne.statut,
    };
  });

  return { articles, total };
}

async function obtenirPanier(req, res, next) {
  try {
    const panier = await obtenirOuCreerPanier(req.tenant.schema, req.auth.clientId);
    const contenu = await calculerPanier(req.tenant.schema, panier.id);
    res.json(contenu);
  } catch (err) {
    next(err);
  }
}

async function ajouterArticle(req, res, next) {
  try {
    const { produitId, varianteId, quantite } = req.body;
    if (!produitId || !quantite || quantite < 1) {
      return res.status(400).json({ erreur: 'produitId et quantite (>= 1) sont requis' });
    }

    const schema = req.tenant.schema;

    // Vérifie que le produit existe et est disponible.
    const produit = await tenantQuery(schema, `SELECT quantite_stock, statut FROM produits WHERE id = $1`, [produitId]);
    if (produit.rows.length === 0 || produit.rows[0].statut === 'masque') {
      return res.status(404).json({ erreur: 'Produit introuvable' });
    }
    if (produit.rows[0].statut === 'rupture') {
      return res.status(409).json({ erreur: 'Ce produit est en rupture de stock' });
    }

    // Le stock à vérifier dépend de si l'article a une variante ou non.
    let stockDisponible = produit.rows[0].quantite_stock;
    if (varianteId) {
      const variante = await tenantQuery(schema, `SELECT stock FROM produit_variantes WHERE id = $1 AND produit_id = $2`, [varianteId, produitId]);
      if (variante.rows.length === 0) {
        return res.status(404).json({ erreur: 'Variante introuvable' });
      }
      stockDisponible = variante.rows[0].stock;
    }
    if (stockDisponible < quantite) {
      return res.status(409).json({ erreur: 'Stock insuffisant' });
    }

    const panier = await obtenirOuCreerPanier(schema, req.auth.clientId);

    await tenantQuery(
      schema,
      `INSERT INTO panier_lignes (panier_id, produit_id, variante_id, quantite)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (panier_id, produit_id, (COALESCE(variante_id, 0)))
       DO UPDATE SET quantite = panier_lignes.quantite + EXCLUDED.quantite`,
      [panier.id, produitId, varianteId || null, quantite]
    );
    await tenantQuery(schema, `UPDATE paniers SET updated_at = now() WHERE id = $1`, [panier.id]);

    const contenu = await calculerPanier(schema, panier.id);
    res.status(201).json(contenu);
  } catch (err) {
    next(err);
  }
}

async function modifierQuantite(req, res, next) {
  try {
    const { quantite } = req.body;
    if (!quantite || quantite < 1) {
      return res.status(400).json({ erreur: 'quantite doit être au moins 1 (utilise DELETE pour retirer un article)' });
    }

    const schema = req.tenant.schema;
    const panier = await obtenirOuCreerPanier(schema, req.auth.clientId);

    // Récupère l'article pour connaître le produit/variante concerné et vérifier le stock.
    const ligne = await tenantQuery(
      schema,
      `SELECT pl.produit_id, pl.variante_id, p.quantite_stock, v.stock AS variante_stock
       FROM panier_lignes pl
       JOIN produits p ON p.id = pl.produit_id
       LEFT JOIN produit_variantes v ON v.id = pl.variante_id
       WHERE pl.id = $1 AND pl.panier_id = $2`,
      [req.params.ligneId, panier.id]
    );
    if (ligne.rows.length === 0) {
      return res.status(404).json({ erreur: 'Article introuvable dans le panier' });
    }

    const stockDisponible = ligne.rows[0].variante_id ? ligne.rows[0].variante_stock : ligne.rows[0].quantite_stock;
    if (stockDisponible < quantite) {
      return res.status(409).json({ erreur: 'Stock insuffisant' });
    }

    await tenantQuery(
      schema,
      `UPDATE panier_lignes SET quantite = $1 WHERE id = $2`,
      [quantite, req.params.ligneId]
    );

    const contenu = await calculerPanier(schema, panier.id);
    res.json(contenu);
  } catch (err) {
    next(err);
  }
}

async function supprimerArticle(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const panier = await obtenirOuCreerPanier(schema, req.auth.clientId);

    await tenantQuery(
      schema,
      `DELETE FROM panier_lignes WHERE id = $1 AND panier_id = $2`,
      [req.params.ligneId, panier.id]
    );

    const contenu = await calculerPanier(schema, panier.id);
    res.json(contenu);
  } catch (err) {
    next(err);
  }
}

module.exports = { obtenirPanier, ajouterArticle, modifierQuantite, supprimerArticle, calculerPanier, obtenirOuCreerPanier };
