-- Schéma "public" : espace du Super Admin.
-- Contient la liste des entreprises et les comptes Super Admin uniquement.
-- Les données métier (produits, commandes...) vivent dans le schéma de
-- chaque entreprise, jamais ici.

CREATE TABLE IF NOT EXISTS entreprises (
  id            SERIAL PRIMARY KEY,
  nom           VARCHAR(150) NOT NULL,
  slug          VARCHAR(150) NOT NULL UNIQUE,   -- utilisé aussi comme nom de schéma
  schema_name   VARCHAR(63) NOT NULL UNIQUE,    -- ex: entreprise_12
  numero_whatsapp VARCHAR(20),                  -- format international, ex: 22670000000
  statut        VARCHAR(20) NOT NULL DEFAULT 'actif'
                  CHECK (statut IN ('actif', 'suspendu', 'archive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS super_admins (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  mot_de_passe  VARCHAR(255) NOT NULL,   -- hash bcrypt, jamais en clair
  nom           VARCHAR(150) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entreprises_statut ON entreprises(statut);
