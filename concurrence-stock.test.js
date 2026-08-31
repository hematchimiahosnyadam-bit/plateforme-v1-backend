const request = require('supertest');
const app = require('../src/app');
const { preparerBaseDeTest, nettoyerBaseDeTest } = require('./setup');
const { tenantQuery } = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');
const { genererToken } = require('../src/utils/jwt');

let contexte;
let produitId;

beforeAll(async () => {
  contexte = await preparerBaseDeTest();
  const schema = contexte.entrepriseTest.schemaName;

  // Produit avec un seul exemplaire en stock — le cas limite qui révèle
  // les problèmes de survente.
  const produit = await tenantQuery(
    schema,
    `INSERT INTO produits (nom, slug, prix, sku, quantite_stock, statut)
     VALUES ('Whisky Rare', 'whisky-rare', 50000, 'WHISKY-RARE-01', 1, 'disponible')
     RETURNING id`
  );
  produitId = produit.rows[0].id;
}, 30000);

afterAll(async () => {
  await nettoyerBaseDeTest();
});

async function creerClientEtCommander(email) {
  const inscription = await request(app)
    .post(`/api/client/${contexte.entrepriseTest.slug}/inscription`)
    .send({ email, motDePasse: 'ClientTest123!', nom: 'Client Test' });

  const token = inscription.body.token;

  await request(app)
    .post('/api/client/panier/articles')
    .set('Authorization', `Bearer ${token}`)
    .send({ produitId, quantite: 1 });

  return request(app)
    .post('/api/client/commandes')
    .set('Authorization', `Bearer ${token}`);
}

describe('Protection contre la survente (concurrence)', () => {
  test('sur 1 seul exemplaire en stock, une seule des deux commandes simultanées réussit', async () => {
    const [resultat1, resultat2] = await Promise.all([
      creerClientEtCommander(`client-a-${Date.now()}@test.local`),
      creerClientEtCommander(`client-b-${Date.now()}@test.local`),
    ]);

    const statuts = [resultat1.status, resultat2.status].sort();
    // Une commande passe (201), l'autre est bloquée par stock insuffisant (409).
    expect(statuts).toEqual([201, 409]);

    const produitApres = await tenantQuery(
      contexte.entrepriseTest.schemaName,
      `SELECT quantite_stock FROM produits WHERE id = $1`,
      [produitId]
    );
    expect(produitApres.rows[0].quantite_stock).toBe(0);
  }, 15000);
});
