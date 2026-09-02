-- Permet au Super Admin de choisir, à la création d'une emigrations/001_tenant_schema_template.sqlntreprise (et
-- modifiable ensuite), quels modules du Dashboard Admin Entreprise sont
-- activés. Par défaut, tout est activé — le Super Admin décoche ce dont
-- il ne veut pas.

ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS fonctionnalites_activees TEXT[] NOT NULL DEFAULT ARRAY[
    'commandes', 'produits', 'categories', 'ma_boutique',
    'clients', 'promotions', 'analytics', 'contenu_site', 'mediatheque'
  ];
