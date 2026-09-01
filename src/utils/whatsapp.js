/**
 * Construit un lien wa.me prérempli avec le récapitulatif de commande.
 * numeroWhatsapp doit être au format international sans "+" ni espaces (ex: "22670000000").
 */
function construireLienWhatsApp(numeroWhatsapp, commande, articles, nomClient) {
  if (!numeroWhatsapp) return null;

  const lignesArticles = articles
    .map((a) => `- ${a.nom}${a.variante ? ` (${a.variante})` : ''} x${a.quantite} — ${a.sousTotal.toLocaleString('fr-FR')} FCFA`)
    .join('\n');

  const message = [
    `Nouvelle commande #${commande.id}`,
    `Client : ${nomClient || 'Non renseigné'}`,
    '',
    lignesArticles,
    '',
    `Total : ${Number(commande.total).toLocaleString('fr-FR')} FCFA`,
  ].join('\n');

  return `https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(message)}`;
}

module.exports = { construireLienWhatsApp };
