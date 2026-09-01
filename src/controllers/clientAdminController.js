const { tenantQuery } = require('../config/db');

const LIMITE_MAX = 60;

/**
 * Liste les clients avec, pour chacun, son nombre de commandes et le
 * montant total dépensé — calculés à la volée (pas de colonne dénormalisée
 * à maintenir), acceptable au volume d'une seule entreprise.
 */
async function listerClients(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limite = Math.min(parseInt(req.query.limite, 10) || 30, LIMITE_MAX);
    const offset = (page - 1) * limite;

    const conditions = [];
    const valeurs = [];
    if (req.query.recherche) {
      valeurs.push(`%${req.query.recherche.trim()}%`);
      conditions.push(`(c.nom ILIKE $${valeurs.length} OR c.email ILIKE $${valeurs.length})`);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [result, total] = await Promise.all([
      tenantQuery(
        schema,
        `SELECT c.id, c.nom, c.email, c.telephone, c.created_at,
                COUNT(cmd.id)::int AS nombre_commandes,
                COALESCE(SUM(cmd.total) FILTER (WHERE cmd.statut != 'annulee'), 0)::numeric AS total_depense,
                MAX(cmd.created_at) AS derniere_commande
         FROM clients c
         LEFT JOIN commandes cmd ON cmd.client_id = c.id
         ${whereClause}
         GROUP BY c.id
         ORDER BY c.created_at DESC
         LIMIT $${valeurs.length + 1} OFFSET $${valeurs.length + 2}`,
        [...valeurs, limite, offset]
      ),
      tenantQuery(schema, `SELECT COUNT(*)::int AS total FROM clients c ${whereClause}`, valeurs),
    ]);

    res.json({ page, limite, total: total.rows[0].total, clients: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Profil détaillé d'un client : infos + historique de commandes.
 */
async function obtenirClient(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const { id } = req.params;

    const client = await tenantQuery(
      schema,
      `SELECT id, nom, email, telephone, created_at,
              (google_id IS NOT NULL) AS via_google
       FROM clients WHERE id = $1`,
      [id]
    );
    if (client.rows.length === 0) {
      return res.status(404).json({ erreur: 'Client introuvable' });
    }

    const commandes = await tenantQuery(
      schema,
      `SELECT id, statut, total, created_at FROM commandes
       WHERE client_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [id]
    );

    const totaux = await tenantQuery(
      schema,
      `SELECT COUNT(*)::int AS nombre_commandes,
              COALESCE(SUM(total) FILTER (WHERE statut != 'annulee'), 0)::numeric AS total_depense
       FROM commandes WHERE client_id = $1`,
      [id]
    );

    res.json({
      ...client.rows[0],
      ...totaux.rows[0],
      commandes: commandes.rows,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listerClients, obtenirClient };
