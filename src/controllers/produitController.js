const { tenantQuery } = require('../config/db');
const { slugify } = require('../utils/slugify');
const { getCache, setCache, invaliderCache } = require('../config/cache');

const LIMITE_MAX = 60;

/**
 * Liste paginée avec recherche + filtres, exécutée côté serveur.
 * Ne charge jamais l'intégralité du catalogue : indispensable pour
 * tenir 10 000+ produits sans ralentir le navigateur.
 */
async function listerProduits(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limite = Math.min(parseInt(req.query.limite, 10) || 20, LIMITE_MAX);
    const offset = (page - 1) * limite;

    // Cache court (30s) : le catalogue est lu bien plus souvent qu'il n'est
    // modifié, donc c'est ici que le cache réduit le plus la charge sur la base.
    const cleCache = `${schema}:produits:${JSON.stringify(req.query)}`;
    const enCache = await getCache(cleCache);
    if (enCache) return res.json(enCache);

    const conditions = [];
    const valeurs = [];

    // Le public ne doit jamais voir un produit masqué ; l'admin, lui, doit
    // pouvoir le voir pour le gérer (et le démasquer). req.auth n'existe
    // que sur la route admin (authentifiée) — absent sur la route publique.
    if (!req.auth) {
      conditions.push(`statut != 'masque'`);
    }

    if (req.query.recherche) {
      valeurs.push(req.query.recherche);
      conditions.push(`to_tsvector('french', nom) @@ plainto_tsquery('french', $${valeurs.length})`);
    }
    if (req.query.categorieId) {
      valeurs.push(req.query.categorieId);
      conditions.push(`categorie_id = $${valeurs.length}`);
    }
    if (req.query.marqueId) {
      valeurs.push(req.query.marqueId);
      conditions.push(`marque_id = $${valeurs.length}`);
    }
    if (req.query.prixMin) {
      valeurs.push(req.query.prixMin);
      conditions.push(`prix >= $${valeurs.length}`);
    }
    if (req.query.prixMax) {
      valeurs.push(req.query.prixMax);
      conditions.push(`prix <= $${valeurs.length}`);
    }
    if (req.query.statut) {
      valeurs.push(req.query.statut);
      conditions.push(`statut = $${valeurs.length}`);
    }

    const triAutorises = { prix_asc: 'prix ASC', prix_desc: 'prix DESC', recent: 'created_at DESC' };
    const tri = triAutorises[req.query.tri] || 'created_at DESC';

    const whereClause = conditions.length ? conditions.join(' AND ') : 'true';

    const [resultatProduits, resultatTotal] = await Promise.all([
      tenantQuery(
        schema,
        `SELECT id, nom, slug, prix, ancien_prix, sku, quantite_stock, statut, categorie_id
         FROM produits
         WHERE ${whereClause}
         ORDER BY ${tri}
         LIMIT $${valeurs.length + 1} OFFSET $${valeurs.length + 2}`,
        [...valeurs, limite, offset]
      ),
      tenantQuery(
        schema,
        `SELECT COUNT(*)::int AS total FROM produits WHERE ${whereClause}`,
        valeurs
      ),
    ]);

    const reponse = {
      page,
      limite,
      total: resultatTotal.rows[0].total,
      produits: resultatProduits.rows,
    };
    await setCache(cleCache, reponse, 30);
    res.json(reponse);
  } catch (err) {
    next(err);
  }
}

async function obtenirProduit(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const parametre = req.params.slug;

    // Accepte soit un slug (boutique publique, liens produit du site),
    // soit un id numérique (dashboard admin, plus simple à manipuler
    // depuis les listes qui ne connaissent que l'id).
    const estId = /^\d+$/.test(parametre);
    const conditionMasque = req.auth ? '' : `AND statut != 'masque'`;

    const produit = await tenantQuery(
      schema,
      `SELECT * FROM produits WHERE ${estId ? 'id' : 'slug'} = $1 ${conditionMasque}`,
      [estId ? Number(parametre) : parametre]
    );
    if (produit.rows.length === 0) {
      return res.status(404).json({ erreur: 'Produit introuvable' });
    }

    const produitId = produit.rows[0].id;
    const [images, variantes] = await Promise.all([
      tenantQuery(schema, `SELECT id, url, ordre FROM produit_images WHERE produit_id = $1 ORDER BY ordre`, [produitId]),
      tenantQuery(schema, `SELECT id, nom, valeur, prix_supplement, stock FROM produit_variantes WHERE produit_id = $1`, [produitId]),
    ]);

    res.json({ ...produit.rows[0], images: images.rows, variantes: variantes.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Réservé aux admins de l'entreprise (voir routes). Le prix, le stock
 * et toutes les données sensibles sont toujours écrits ici, côté serveur —
 * jamais recalculés depuis une valeur envoyée par le frontend ailleurs.
 */
async function creerProduit(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const { nom, description, descriptionLongue, prix, ancienPrix, categorieId, marqueId, sku, quantiteStock, statut } = req.body;

    if (!nom || prix === undefined || !sku) {
      return res.status(400).json({ erreur: 'Nom, prix et SKU sont obligatoires' });
    }
    if (Number(prix) < 0) {
      return res.status(400).json({ erreur: 'Le prix ne peut pas être négatif' });
    }

    const slug = slugify(nom);

    const result = await tenantQuery(
      schema,
      `INSERT INTO produits
        (nom, slug, description, description_longue, prix, ancien_prix, categorie_id, marque_id, sku, quantite_stock, statut)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [nom, slug, description || null, descriptionLongue || null, prix, ancienPrix || null,
       categorieId || null, marqueId || null, sku, quantiteStock || 0, statut || 'disponible']
    );

    await invaliderCache(schema, 'produits');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erreur: 'Un produit avec ce nom ou ce SKU existe déjà' });
    }
    next(err);
  }
}

async function modifierProduit(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const { nom, description, descriptionLongue, prix, ancienPrix, categorieId, marqueId, sku, quantiteStock, statut } = req.body;

    if (prix !== undefined && Number(prix) < 0) {
      return res.status(400).json({ erreur: 'Le prix ne peut pas être négatif' });
    }

    const result = await tenantQuery(
      schema,
      `UPDATE produits SET
        nom = COALESCE($1, nom),
        description = COALESCE($2, description),
        description_longue = COALESCE($3, description_longue),
        prix = COALESCE($4, prix),
        ancien_prix = COALESCE($5, ancien_prix),
        categorie_id = COALESCE($6, categorie_id),
        marque_id = COALESCE($7, marque_id),
        sku = COALESCE($8, sku),
        quantite_stock = COALESCE($9, quantite_stock),
        statut = COALESCE($10, statut),
        updated_at = now()
       WHERE id = $11
       RETURNING *`,
      [nom, description, descriptionLongue, prix, ancienPrix, categorieId, marqueId, sku, quantiteStock, statut, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Produit introuvable' });
    }
    await invaliderCache(req.tenant.schema, 'produits');
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

async function supprimerProduit(req, res, next) {
  try {
    const result = await tenantQuery(
      req.tenant.schema,
      `DELETE FROM produits WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Produit introuvable' });
    }
    await invaliderCache(req.tenant.schema, 'produits');
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listerProduits, obtenirProduit, creerProduit, modifierProduit, supprimerProduit };
