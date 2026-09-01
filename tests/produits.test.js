const request = require('supertest');
const app = require('../src/app');
const { preparerBaseDeTest, nettoyerBaseDeTest } = require('./setup');
const { tenantQuery } = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');
const { genererToken } = require('../src/utils/jwt');

let contexte;
let tokenAdmin;

beforeAll(async () => {
  contexte = await preparerBaseDeTest();

  const hash = await hashPassword('AdminTest123!');
  await tenantQuery(
    contexte.entrepriseTest.schemaName,
    `INSERT INTO utilisateurs (email, mot_de_passe, nom, role) VALUES ($1,$2,'Admin Test','admin')`,
    ['admin-test@test.local', hash]
  );

  tokenAdmin = genererToken({ role: 'admin', entrepriseId: contexte.entrepriseTest.id });
}, 30000);

afterAll(async () => {
  await nettoyerBaseDeTest();
});

describe('Catalogue produits', () => {
  test('refuse la création avec un prix négatif', async () => {
    const reponse = await request(app)
      .post('/api/admin/produits')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nom: 'Produit invalide', prix: -10, sku: 'SKU-INVALIDE' });

    expect(reponse.status).toBe(400);
  });

  test('refuse la création sans SKU', async () => {
    const reponse = await request(app)
      .post('/api/admin/produits')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nom: 'Produit sans SKU', prix: 5000 });

    expect(reponse.status).toBe(400);
  });

  test('crée un produit valide', async () => {
    const reponse = await request(app)
      .post('/api/admin/produits')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nom: 'Whisky Test 12 ans', prix: 25000, sku: 'WHISKY-TEST-12' });

    expect(reponse.status).toBe(201);
    expect(reponse.body.slug).toBe('whisky-test-12-ans');
  });

  test('refuse un SKU en double', async () => {
    const reponse = await request(app)
      .post('/api/admin/produits')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ nom: 'Autre produit', prix: 1000, sku: 'WHISKY-TEST-12' });

    expect(reponse.status).toBe(409);
  });

  test('la liste ne dépasse jamais la limite maximale par page', async () => {
    const reponse = await request(app)
      .get('/api/admin/produits?limite=9999')
      .set('Authorization', `Bearer ${tokenAdmin}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body.limite).toBeLessThanOrEqual(60);
  });

  test('un compte sans rôle admin ne peut pas créer de produit', async () => {
    const tokenGestionnaireCommandes = genererToken({
      role: 'gestionnaire_commandes',
      entrepriseId: contexte.entrepriseTest.id,
    });

    const reponse = await request(app)
      .post('/api/admin/produits')
      .set('Authorization', `Bearer ${tokenGestionnaireCommandes}`)
      .send({ nom: 'Produit interdit', prix: 1000, sku: 'SKU-INTERDIT' });

    expect(reponse.status).toBe(403);
  });
});
