# Plateforme V1 — Backend

Backend multi-tenant (un schéma PostgreSQL isolé par entreprise) pour une
plateforme e-commerce hébergeant plusieurs boutiques indépendantes.

## Stack

- Node.js + Express
- PostgreSQL (multi-tenant : un schéma par entreprise)
- Redis (cache catalogue, optionnel en développement)
- JWT (authentification)

## Installation

```bash
npm install
cp .env.example .env      # puis remplis tes vraies valeurs
```

Crée une base PostgreSQL vide portant le nom mis dans `.env` (`DB_NAME`), puis :

```bash
npm run migrate                                              # crée le schéma public
node src/utils/creerSuperAdmin.js email motdepasse "Nom"     # ton premier compte Super Admin
npm run dev                                                  # démarre le serveur (http://localhost:4000)
```

Vérifie que tout tourne : `GET http://localhost:4000/api/sante`

## Tests

```bash
cp .env.test.example .env.test   # pointe vers une base de TEST séparée
npm test
```

Ne jamais faire pointer `.env.test` vers la base de production.

## Architecture

- **Schéma `public`** : Super Admin + liste des entreprises uniquement.
- **Un schéma par entreprise** (ex: `entreprise_3_whisky_shop`) : toutes les
  données métier (produits, commandes, clients...). Isolation totale —
  aucune requête ne peut croiser deux entreprises.
- Le schéma ciblé par une requête vient **toujours du token JWT vérifié**,
  jamais d'un paramètre d'URL modifiable par le client.

## Rôles

| Rôle | Portée | Peut faire |
|---|---|---|
| `super_admin` | Toutes les entreprises | Créer/gérer les entreprises, stats globales |
| `admin` | Une entreprise | Tout gérer dans son entreprise |
| `gestionnaire_produits` | Une entreprise | Produits, catégories, promotions |
| `gestionnaire_commandes` | Une entreprise | Commandes uniquement |
| `client` | Une boutique | Son compte, son panier, ses commandes |

## Endpoints principaux

### Authentification
| Méthode | Route | Accès |
|---|---|---|
| POST | `/api/auth/super-admin/connexion` | Public |
| POST | `/api/auth/entreprise/connexion` | Public |
| POST | `/api/client/:slugEntreprise/inscription` | Public |
| POST | `/api/client/:slugEntreprise/connexion` | Public |

### Entreprises (Super Admin)
| Méthode | Route |
|---|---|
| GET | `/api/entreprises` |
| POST | `/api/entreprises` |

### Catalogue (admin de l'entreprise, token requis)
| Méthode | Route |
|---|---|
| GET | `/api/admin/produits?recherche=&categorieId=&prixMin=&prixMax=&tri=&page=` |
| GET | `/api/admin/produits/:slug` |
| POST | `/api/admin/produits` |
| PUT | `/api/admin/produits/:id` |
| DELETE | `/api/admin/produits/:id` |
| POST | `/api/admin/produits/:id/images` (jusqu'à 6 fichiers, champ `images`) |
| DELETE | `/api/admin/produits/images/:imageId` |
| GET/POST/PUT/DELETE | `/api/admin/categories` |

### Boutique publique (vitrine, sans compte)
| Méthode | Route |
|---|---|
| GET | `/api/boutique/:slugEntreprise/produits` |
| GET | `/api/boutique/:slugEntreprise/produits/:slug` |
| GET | `/api/boutique/:slugEntreprise/categories` |

### Panier & commandes (client connecté)
| Méthode | Route |
|---|---|
| GET | `/api/client/panier` |
| POST | `/api/client/panier/articles` |
| PUT | `/api/client/panier/articles/:ligneId` |
| DELETE | `/api/client/panier/articles/:ligneId` |
| POST | `/api/client/commandes` |
| GET | `/api/client/commandes/mes-commandes` |
| GET | `/api/client/commandes/:id` |

### Commandes (admin)
| Méthode | Route |
|---|---|
| GET | `/api/client/admin/commandes?statut=` |
| PUT | `/api/client/admin/commandes/:id/statut` |

### Promotions
| Méthode | Route | Accès |
|---|---|---|
| POST | `/api/admin/promotions/appliquer` | Client (applique un code à son panier) |
| GET/POST/PUT/DELETE | `/api/admin/promotions` | Admin |

### Dashboards
| Méthode | Route | Accès |
|---|---|---|
| GET | `/api/dashboard/super-admin` | Super Admin |
| GET | `/api/dashboard/entreprise` | Admin de l'entreprise |

### Client — connexion Google
| Méthode | Route |
|---|---|
| POST | `/api/client/:slugEntreprise/connexion-google` (body: `{ idToken }`) |

Nécessite `GOOGLE_CLIENT_ID` dans `.env` (créé sur Google Cloud Console). Sans cette variable, la route répond 503.

### Paramètres entreprise (admin)
| Méthode | Route |
|---|---|
| PUT | `/api/mon-entreprise` (body: `{ numeroWhatsapp }`) |

### Notifications
| Méthode | Route |
|---|---|
| GET | `/api/notifications` |
| PUT | `/api/notifications/:id/lue` |

### Contenu de la boutique publique (admin) — piloté depuis le Dashboard Admin Entreprise
| Méthode | Route |
|---|---|
| GET | `/api/mon-entreprise/contenu` |
| PUT | `/api/mon-entreprise/contenu` (admin uniquement, body: champs à modifier uniquement — `heroImageUrl`, `heroTexte`, `bienvenueImageUrl`, `produitsMisEnAvant` [liste d'IDs], `categoriesMisesEnAvant` [liste d'IDs], `videoUrl`, `videoMiniatureUrl`, `destinationType` [`meilleurs_produits`\|`categorie`\|`produit`\|`boutique`\|`page_interne`], `destinationValeur`) |

### Médiathèque (admin)
| Méthode | Route |
|---|---|
| GET | `/api/mon-entreprise/medias?page=&limite=` |
| POST | `/api/mon-entreprise/medias` (admin uniquement, form-data champ `image`, jpg/png/webp, 5 Mo max) |
| DELETE | `/api/mon-entreprise/medias/:id` (admin uniquement) |

**Note :** une entreprise = une seule boutique (un schéma). Le backend ne gère pas plusieurs boutiques par entreprise.

## Migrations pour installations existantes

Les entreprises créées avant l'ajout du contenu/médiathèque n'ont pas encore les tables `contenu_site` et `medias`. Pour les ajouter à toutes les entreprises déjà existantes, exécuter une seule fois :

```
node src/utils/migrerTenantsExistants.js migrations/002_contenu_medias.sql
```

Les nouvelles entreprises reçoivent automatiquement cette migration à leur création — pas d'action requise pour elles.

## Sécurité déjà en place

- Mots de passe hashés (bcrypt, 12 rounds)
- JWT signé, expiration configurable
- Rate limiting sur les routes de connexion (anti-bruteforce)
- Validation systématique côté serveur (prix, stock, statuts...) — jamais confiance au frontend
- Isolation stricte entre entreprises (schéma déterminé par le token, jamais par l'URL)
- Décrément de stock atomique (protection contre la survente en cas de commandes simultanées)
- En-têtes de sécurité (helmet), CORS restreint à l'origine configurée
- Upload d'images : types de fichiers whitelistés, taille limitée, noms de fichiers aléatoires

## Ce qu'il reste à faire

- Frontend (boutique + dashboards admin) — rien de ce qui suit n'est possible sans lui :
  - PWA (manifest, service worker)
  - SEO (metadata, sitemap)
- Stockage des images en cloud (S3/R2) si tu passes à plusieurs serveurs
- Emails/SMS transactionnels (nécessite un service externe type SendGrid/Twilio, avec tes propres identifiants)

## Déploiement en production (résumé)

1. Base PostgreSQL managée (ex: Supabase, Neon, Railway) — active un pooler de connexions si dispo.
2. Redis managé (ex: Upstash) pour activer le cache catalogue.
3. Déploie le backend (ex: Railway, Render, ou VPS + PM2 avec `ecosystem.config.js`).
4. Variables d'environnement en production : change absolument `JWT_SECRET`, mets `NODE_ENV=production`, restreins `CORS_ORIGIN` à ton vrai domaine.
5. Lance `npm run migrate` sur la base de production avant le premier démarrage.
6. Stockage d'images : passe de `uploads/` local à un stockage cloud si plusieurs instances du serveur tournent en parallèle.
