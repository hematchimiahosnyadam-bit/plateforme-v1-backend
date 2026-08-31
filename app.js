require('dotenv').config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const authRoutes = require('./routes/authRoutes');
const entrepriseRoutes = require('./routes/entrepriseRoutes');
const monEntrepriseRoutes = require('./routes/monEntrepriseRoutes');
const monProfilRoutes = require('./routes/monProfilRoutes');
const superAdminProfilRoutes = require('./routes/superAdminProfilRoutes');
const produitRoutes = require('./routes/produitRoutes');
const categorieRoutes = require('./routes/categorieRoutes');
const boutiquePubliqueRoutes = require('./routes/boutiquePubliqueRoutes');
const clientRoutes = require('./routes/clientRoutes');
const promotionRoutes = require('./routes/promotionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const contenuRoutes = require('./routes/contenuRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const { gestionnaireErreurs } = require('./middleware/errorHandler');
const { journaliserRequetes } = require('./middleware/requestLogger');
const { pool } = require('./config/db');

const app = express();

app.use(helmet());
app.use(compression()); // réponses compressées : moins de données à transférer par requête
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(journaliserRequetes);

// Sert les images uploadées (ex: /uploads/produits/xxxx.jpg)
app.use('/uploads', express.static(require('path').join(__dirname, '../uploads')));

// Vérifie aussi que la base répond réellement, pas juste que le process tourne.
app.get('/api/sante', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ statut: 'ok', base_de_donnees: 'connectee' });
  } catch (err) {
    res.status(503).json({ statut: 'degrade', base_de_donnees: 'injoignable' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/entreprises', entrepriseRoutes);
app.use('/api/mon-entreprise', monEntrepriseRoutes);
app.use('/api/admin/produits', produitRoutes);
app.use('/api/admin/categories', categorieRoutes);
app.use('/api/boutique', boutiquePubliqueRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/admin/promotions', promotionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/mon-entreprise/contenu', contenuRoutes);
app.use('/api/mon-entreprise/medias', mediaRoutes);
app.use('/api/mon-profil', monProfilRoutes);
app.use('/api/super-admin/mon-profil', superAdminProfilRoutes);

// 404 pour toute route inconnue
app.use((req, res) => res.status(404).json({ erreur: 'Route introuvable' }));

// Doit rester le DERNIER middleware
app.use(gestionnaireErreurs);

module.exports = app;
