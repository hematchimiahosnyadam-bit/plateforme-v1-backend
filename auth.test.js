const request = require('supertest');
const app = require('../src/app');
const { preparerBaseDeTest, nettoyerBaseDeTest } = require('./setup');

let contexte;

beforeAll(async () => {
  contexte = await preparerBaseDeTest();
}, 30000);

afterAll(async () => {
  await nettoyerBaseDeTest();
});

describe('Authentification Super Admin', () => {
  test('refuse un mot de passe incorrect', async () => {
    const reponse = await request(app)
      .post('/api/auth/super-admin/connexion')
      .send({ email: contexte.superAdminEmail, motDePasse: 'mauvais-mot-de-passe' });

    expect(reponse.status).toBe(401);
  });

  test('refuse un email inexistant avec le même message (pas de fuite d\'info)', async () => {
    const reponseMauvaisEmail = await request(app)
      .post('/api/auth/super-admin/connexion')
      .send({ email: 'inexistant@test.local', motDePasse: 'peu-importe' });
    const reponseMauvaisMdp = await request(app)
      .post('/api/auth/super-admin/connexion')
      .send({ email: contexte.superAdminEmail, motDePasse: 'peu-importe' });

    expect(reponseMauvaisEmail.status).toBe(401);
    expect(reponseMauvaisMdp.status).toBe(401);
    expect(reponseMauvaisEmail.body.erreur).toBe(reponseMauvaisMdp.body.erreur);
  });

  test('accepte les bons identifiants et renvoie un token', async () => {
    const reponse = await request(app)
      .post('/api/auth/super-admin/connexion')
      .send({ email: contexte.superAdminEmail, motDePasse: contexte.superAdminMotDePasse });

    expect(reponse.status).toBe(200);
    expect(reponse.body.token).toBeDefined();
  });

  test('refuse une route protégée sans token', async () => {
    const reponse = await request(app).get('/api/entreprises');
    expect(reponse.status).toBe(401);
  });
});
