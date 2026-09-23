-- 0001_trigram_search.sql
-- Enable the PostgreSQL trigram extension for fuzzy / partial-word search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index on products.title — covers similarity() scoring and ILIKE patterns
CREATE INDEX IF NOT EXISTS products_title_trgm_idx
  ON products
  USING GIN (title gin_trgm_ops);

-- GIN index on products.description — enables full-description fuzzy matching
CREATE INDEX IF NOT EXISTS products_description_trgm_idx
  ON products
  USING GIN (description gin_trgm_ops);
