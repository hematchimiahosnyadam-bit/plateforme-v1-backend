const { tenantQuery } = require('../config/db');

async function listerMesNotifications(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const estAdmin = ['admin', 'gestionnaire_produits', 'gestionnaire_commandes'].includes(req.auth.role);

    const result = await tenantQuery(
      schema,
      estAdmin
        ? `SELECT * FROM notifications WHERE destinataire_type = 'admin' ORDER BY created_at DESC LIMIT 50`
        : `SELECT * FROM notifications WHERE destinataire_type = 'client' AND destinataire_id = $1 ORDER BY created_at DESC LIMIT 50`,
      estAdmin ? [] : [req.auth.clientId]
    );

    const nonLues = result.rows.filter((n) => !n.lue).length;
    res.json({ notifications: result.rows, nonLues });
  } catch (err) {
    next(err);
  }
}

async function marquerCommeLue(req, res, next) {
  try {
    const schema = req.tenant.schema;
    const estAdmin = ['admin', 'gestionnaire_produits', 'gestionnaire_commandes'].includes(req.auth.role);

    const result = await tenantQuery(
      schema,
      estAdmin
        ? `UPDATE notifications SET lue = true WHERE id = $1 AND destinataire_type = 'admin' RETURNING id`
        : `UPDATE notifications SET lue = true WHERE id = $1 AND destinataire_type = 'client' AND destinataire_id = $2 RETURNING id`,
      estAdmin ? [req.params.id] : [req.params.id, req.auth.clientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ erreur: 'Notification introuvable' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { listerMesNotifications, marquerCommeLue };
