-- Ajouté au gabarit tenant existant (001_tenant_schema_template.sql).
-- Permet au Dashboard Admin Entreprise de piloter le contenu de la
-- boutique publique (hero, message de bienvenue, mise en avant,
-- vidéo pub) sans jamais toucher au code du frontend public.

-- Une seule ligne par entreprise : on force cela avec une contrainte
-- CHECK (id = 1), plus simple qu'une table à part pour un singleton.
CREATE TABLE IF NOT EXISTS contenu_site (
  id                      INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  hero_image_url          VARCHAR(500),
  hero_texte              VARCHAR(300),
  bienvenue_image_url     VARCHAR(500),
  produits_mis_en_avant   INTEGER[] NOT NULL DEFAULT '{}',
  categories_mises_en_avant INTEGER[] NOT NULL DEFAULT '{}',
  video_url               VARCHAR(500),
  video_miniature_url     VARCHAR(500),
  -- destination_type : 'meilleurs_produits' | 'categorie' | 'produit' | 'boutique' | 'page_interne'
  destination_type        VARCHAR(30) NOT NULL DEFAULT 'meilleurs_produits',
  destination_valeur      VARCHAR(255),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ligne par défaut créée directement pour éviter un cas "pas de ligne
-- encore" à gérer côté controller (on fait toujours un simple UPDATE).
INSERT INTO contenu_site (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS medias (
  id              SERIAL PRIMARY KEY,
  url             VARCHAR(500) NOT NULL,
  nom_original    VARCHAR(255) NOT NULL,
  taille_octets   INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
