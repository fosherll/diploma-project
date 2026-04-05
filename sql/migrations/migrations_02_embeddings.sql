BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS esco_skill_embeddings (
                                                     id          BIGSERIAL PRIMARY KEY,
                                                     esco_uri    TEXT NOT NULL UNIQUE,
                                                     esco_label  TEXT NOT NULL,
                                                     embedding   vector(384) NOT NULL,
    model_name  TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    semantic_group TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_esco_embeddings_uri
    ON esco_skill_embeddings (esco_uri);

CREATE INDEX IF NOT EXISTS idx_esco_embeddings_vector
    ON esco_skill_embeddings USING hnsw (embedding vector_cosine_ops);

ALTER TABLE cv_skill_mappings
    ADD COLUMN IF NOT EXISTS embedding vector(384);

ALTER TABLE vac_skill_mappings
    ADD COLUMN IF NOT EXISTS embedding vector(384);

CREATE INDEX IF NOT EXISTS idx_cv_skill_mappings_embedding
    ON cv_skill_mappings USING hnsw (embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vac_skill_mappings_embedding
    ON vac_skill_mappings USING hnsw (embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION cosine_similarity(a vector, b vector)
RETURNS FLOAT AS $$
SELECT 1 - (a <=> b);
$$ LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE;

COMMIT;
