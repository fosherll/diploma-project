-- Вмикаємо pgvector розширення
CREATE EXTENSION IF NOT EXISTS vector;

-- Додаємо колонку embedding до cv_skill_mappings
ALTER TABLE cv_skill_mappings
    ADD COLUMN IF NOT EXISTS embedding vector(384);

-- Додаємо колонку embedding до vac_skill_mappings
ALTER TABLE vac_skill_mappings
    ADD COLUMN IF NOT EXISTS embedding vector(384);

-- Таблиця для всіх ESCO ембедингів (для пошуку)
CREATE TABLE IF NOT EXISTS esco_skill_embeddings (
                                                     esco_uri TEXT PRIMARY KEY,
                                                     esco_label TEXT,
                                                     embedding vector(384),
    model_name TEXT,
    semantic_group TEXT
    );

-- Індекси для швидкого косинусного пошуку (HNSW)
CREATE INDEX IF NOT EXISTS cv_skill_mappings_embedding_idx
    ON cv_skill_mappings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS vac_skill_mappings_embedding_idx
    ON vac_skill_mappings USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS esco_skill_embeddings_embedding_idx
    ON esco_skill_embeddings USING hnsw (embedding vector_cosine_ops);
