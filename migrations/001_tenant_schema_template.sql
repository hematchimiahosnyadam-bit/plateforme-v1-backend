-- Gabarit appliqué à CHAQUE nouveau schéma d'entreprise (ex: entreprise_12).
-- Le nom du schéma est injecté par tenantService.js au moment de la création
-- (jamais construit à partir d'une saisie utilisateur brute).

CREATE TABLE IF NOT EXISTS utilisateurs (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  mot_de_passe  VARCHAR(255) NOT NULL,
  nom           VARCHAR(150) NOT NULL,
  role          VARCHAR(30) NOT NULL DEFAULT 'admin'
                  CHECK (role IN ('admin', 'gestionnaire_produits', 'gestionnaire_commandes')),
  actif         BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id            SERIAL PRIMARY KEY,
  nom           VARCHAR(150) NOT NULL,
  slug          VARCHAR(150) NOT NULL UNIQUE,
  parent_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marques (
  id            SERIAL PRIMARY KEY,
  nom           VARCHAR(150) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS produits (
  id                SERIAL PRIMARY KEY,
  nom               VARCHAR(200) NOT NULL,
  slug              VARCHAR(200) NOT NULL UNIQUE,
  description       TEXT,
  description_longue TEXT,
  prix              NUMERIC(12,2) NOT NULL CHECK (prix >= 0),
  ancien_prix       NUMERIC(12,2),
  categorie_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  marque_id         INTEGER REFERENCES marques(id) ON DELETE SET NULL,
  sku               VARCHAR(80) NOT NULL UNIQUE,
  quantite_stock    INTEGER NOT NULL DEFAULT 0 CHECK (quantite_stock >= 0),
  statut            VARCHAR(20) NOT NULL DEFAULT 'disponible'
                       CHECK (statut IN ('disponible', 'rupture', 'promotion', 'nouveau', 'masque')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS produit_images (
  id            SERIAL PRIMARY KEY,
  produit_id    INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  url           VARCHAR(500) NOT NULL,
  ordre         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS produit_variantes (
  id            SERIAL PRIMARY KEY,
  produit_id    INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  nom           VARCHAR(100) NOT NULL,   -- ex: "Taille", "Format"
  valeur        VARCHAR(100) NOT NULL,   -- ex: "70cl", "Rouge"
  prix_supplement NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clients (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  mot_de_passe  VARCHAR(255),            -- NULL si le compte vient de Google (pas de mot de passe local)
  google_id     VARCHAR(255) UNIQUE,     -- identifiant Google, si connexion Google
  nom           VARCHAR(150) NOT NULL,
  telephone     VARCHAR(30),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (mot_de_passe IS NOT NULL OR google_id IS NOT NULL) -- il faut au moins un moyen de se connecter
);

CREATE TABLE IF NOT EXISTS commandes (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  statut          VARCHAR(30) NOT NULL DEFAULT 'en_attente'
                     CHECK (statut IN ('en_attente','confirmee','en_preparation','expediee','livree','annulee')),
  total           NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  code_promo      VARCHAR(50),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commande_lignes (
  id              SERIAL PRIMARY KEY,
  commande_id     INTEGER NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  produit_id      INTEGER REFERENCES produits(id) ON DELETE SET NULL,
  variante_id     INTEGER REFERENCES produit_variantes(id) ON DELETE SET NULL,
  quantite        INTEGER NOT NULL CHECK (quantite > 0),
  prix_unitaire   NUMERIC(12,2) NOT NULL   -- figé au moment de la commande
);

CREATE TABLE IF NOT EXISTS promotions (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(50) UNIQUE,
  type          VARCHAR(20) NOT NULL CHECK (type IN ('pourcentage', 'montant_fixe')),
  valeur        NUMERIC(12,2) NOT NULL,
  date_debut    TIMESTAMPTZ NOT NULL,
  date_fin      TIMESTAMPTZ NOT NULL,
  actif         BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS paniers (
  id            SERIAL PRIMARY KEY,
  client_id     INTEGER NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  code_promo    VARCHAR(50),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS panier_lignes (
  id            SERIAL PRIMARY KEY,
  panier_id     INTEGER NOT NULL REFERENCES paniers(id) ON DELETE CASCADE,
  produit_id    INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  variante_id   INTEGER REFERENCES produit_variantes(id) ON DELETE CASCADE,
  quantite      INTEGER NOT NULL CHECK (quantite > 0)
);

-- Index unique "fonctionnel" plutôt qu'une contrainte UNIQUE classique :
-- en SQL, deux NULL ne sont jamais égaux entre eux, donc une UNIQUE
-- classique sur (panier_id, produit_id, variante_id) laisse passer des
-- doublons pour les produits SANS variante (variante_id = NULL).
-- COALESCE(variante_id, 0) traite "pas de variante" comme une vraie valeur
-- commune, donc les doublons sont bien détectés dans ce cas aussi.
CREATE UNIQUE INDEX IF NOT EXISTS panier_lignes_produit_unique
  ON panier_lignes (panier_id, produit_id, COALESCE(variante_id, 0));

CREATE TABLE IF NOT EXISTS notifications (
  id                SERIAL PRIMARY KEY,
  destinataire_type VARCHAR(20) NOT NULL CHECK (destinataire_type IN ('client', 'admin')),
  destinataire_id   INTEGER,   -- id du client si destinataire_type = 'client', sinon NULL (visible par tous les admins)
  type              VARCHAR(50) NOT NULL,   -- ex: 'commande_creee', 'commande_statut', 'stock_faible'
  message           TEXT NOT NULL,
  lien              VARCHAR(255),           -- ex: /commandes/12
  lue               BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_destinataire ON notifications(destinataire_type, destinataire_id, lue);

CREATE INDEX IF NOT EXISTS idx_produits_categorie ON produits(categorie_id);
CREATE INDEX IF NOT EXISTS idx_produits_statut ON produits(statut);
CREATE INDEX IF NOT EXISTS idx_produits_nom ON produits USING gin (to_tsvector('french', nom));
CREATE INDEX IF NOT EXISTS idx_commandes_client ON commandes(client_id);
CREATE INDEX IF NOT EXISTS idx_commandes_statut ON commandes(statut);
