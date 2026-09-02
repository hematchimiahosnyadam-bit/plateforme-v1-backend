-- Complète la table "entreprises" (schéma public, pas un gabarit tenant)
-- avec les informations de contact que le Dashboard Admin Entreprise et
-- la boutique publique doivent pouvoir afficher (jusqu'ici en dur dans
-- config.js côté boutique publique — cette migration les rend réellement
-- pilotables depuis le dashboard).

ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS description   VARCHAR(500),
  ADD COLUMN IF NOT EXISTS email         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS telephone     VARCHAR(30),
  ADD COLUMN IF NOT EXISTS adresse       VARCHAR(300),
  ADD COLUMN IF NOT EXISTS horaires      VARCHAR(300),
  ADD COLUMN IF NOT EXISTS logo_url      VARCHAR(500),
  ADD COLUMN IF NOT EXISTS facebook_url  VARCHAR(300),
  ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(300);
