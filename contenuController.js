const { tenantQuery } = require('../config/db');

const DESTINATIONS_VALIDES = ['meilleurs_produits', 'categorie', 'produit', 'boutique', 'page_interne'];

/**
 * Retourne le contenu pilotable de la boutique publique (hero, message
 * de bienvenue, mise en avant, vidéo). Toujours une seule ligne (id=1),
 * créée automatiquement à la migration du tenant.
 */
async function obtenirContenu(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const result = await tenantQuery(schema, 'SELECT * FROM contenu_site WHERE id = 1');
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * Met à jour le contenu. Une seule ligne (UPDATE, jamais d'INSERT ici) :
 * la ligne id=1 existe déjà depuis la migration, donc pas de cas
 * "aucune ligne" à gérer côté frontend.
 *
 * Chaque champ n'est modifié que s'il est explicitement présent dans le
 * corps de la requête (via "in", pas juste "truthy") — sinon un champ
 * vide envoyé par erreur écraserait silencieusement l'existant, et à
 * l'inverse on ne pourrait jamais vider un champ texte volontairement.
 */
async function modifierContenu(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const corps = req.body;

    if ('destinationType' in corps && !DESTINATIONS_VALIDES.includes(corps.destinationType)) {
      return res.status(400).json({ erreur: 'Type de destination invalide' });
    }
    if ('produitsMisEnAvant' in corps && !Array.isArray(corps.produitsMisEnAvant)) {
      return res.status(400).json({ erreur: 'produitsMisEnAvant doit être une liste' });
    }
    if ('categoriesMisesEnAvant' in corps && !Array.isArray(corps.categoriesMisesEnAvant)) {
      return res.status(400).json({ erreur: 'categoriesMisesEnAvant doit être une liste' });
    }

    const colonnes = {
      heroImageUrl: 'hero_image_url',
      heroTexte: 'hero_texte',
      bienvenueImageUrl: 'bienvenue_image_url',
      produitsMisEnAvant: 'produits_mis_en_avant',
      categoriesMisesEnAvant: 'categories_mises_en_avant',
      videoUrl: 'video_url',
      videoMiniatureUrl: 'video_miniature_url',
      destinationType: 'destination_type',
      destinationValeur: 'destination_valeur',
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

    const result = await tenantQuery(
      schema,
      `UPDATE contenu_site SET ${affectations.join(', ')}, updated_at = now()
       WHERE id = 1
       RETURNING *`,
      valeurs
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * Version publique de obtenirContenu : résout les IDs de
 * produits_mis_en_avant / categories_mises_en_avant en objets complets
 * (nom, prix, etc.) directement, pour éviter à la boutique publique de
 * faire un aller-retour supplémentaire par produit.
 */
async function obtenirContenuPublic(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const contenu = await tenantQuery(schema, 'SELECT * FROM contenu_site WHERE id = 1');
    const donnees = contenu.rows[0];
    if (!donnees) {
      return res.json({
        hero_image_url: null, hero_texte: null, bienvenue_image_url: null,
        produits_mis_en_avant: [], categories_mises_en_avant: [],
        video_url: null, video_miniature_url: null,
        destination_type: 'meilleurs_produits', destination_valeur: null,
      });
    }

    const [produits, categories] = await Promise.all([
      donnees.produits_mis_en_avant.length > 0
        ? tenantQuery(schema, `SELECT id, nom, slug, prix, ancien_prix, statut FROM produits WHERE id = ANY($1) AND statut != 'masque'`, [donnees.produits_mis_en_avant])
        : { rows: [] },
      donnees.categories_mises_en_avant.length > 0
        ? tenantQuery(schema, `SELECT id, nom, slug FROM categories WHERE id = ANY($1)`, [donnees.categories_mises_en_avant])
        : { rows: [] },
    ]);

    // Si la destination de la vidéo pointe vers un produit précis, on
    // résout aussi son slug ici : la boutique publique navigue par slug
    // (jamais par id brut), et destination_valeur ne stocke qu'un id.
    let destinationSlug = null;
    if (donnees.destination_type === 'produit' && donnees.destination_valeur) {
      const produitCible = await tenantQuery(schema, `SELECT slug FROM produits WHERE id = $1`, [donnees.destination_valeur]);
      destinationSlug = produitCible.rows[0]?.slug || null;
    }

    res.json({
      hero_image_url: donnees.hero_image_url,
      hero_texte: donnees.hero_texte,
      bienvenue_image_url: donnees.bienvenue_image_url,
      video_url: donnees.video_url,
      video_miniature_url: donnees.video_miniature_url,
      destination_type: donnees.destination_type,
      destination_valeur: donnees.destination_valeur,
      destination_slug: destinationSlug,
      produits_mis_en_avant: produits.rows,
      categories_mises_en_avant: categories.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { obtenirContenu, modifierContenu, obtenirContenuPublic };
