const { tenantQuery } = require('../config/db');

/**
 * Notification pour un client précis (ex: sa commande a changé de statut).
 */
async function notifierClient(schema, clientId, type, message, lien = null) {
  await tenantQuery(
    schema,
    `INSERT INTO notifications (destinataire_type, destinataire_id, type, message, lien)
     VALUES ('client', $1, $2, $3, $4)`,
    [clientId, type, message, lien]
  );
}

/**
 * Notification visible par tous les admins de l'entreprise (ex: nouvelle
 * commande, alerte de stock faible). destinataire_id reste NULL : ce n'est
 * pas un compte précis, c'est un canal partagé pour toute l'équipe.
 */
async function notifierAdmins(schema, type, message, lien = null) {
  await tenantQuery(
    schema,
    `INSERT INTO notifications (destinataire_type, destinataire_id, type, message, lien)
     VALUES ('admin', NULL, $1, $2, $3)`,
    [type, message, lien]
  );
}

module.exports = { notifierClient, notifierAdmins };
