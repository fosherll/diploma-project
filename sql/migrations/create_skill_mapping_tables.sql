CREATE TABLE IF NOT EXISTS cv_skill_mappings (
                                                 id bigserial PRIMARY KEY,
                                                 document_id text NOT NULL,
                                                 raw_skill text NOT NULL,
                                                 esco_uri text,
                                                 esco_label text,
                                                 confidence numeric(6,4),
    method text,
    via_graph boolean DEFAULT false,
    reasoning text,
    details jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
    );

CREATE TABLE IF NOT EXISTS vac_skill_mappings (
                                                  id bigserial PRIMARY KEY,
                                                  document_id text NOT NULL,
                                                  raw_skill text NOT NULL,
                                                  esco_uri text,
                                                  esco_label text,
                                                  confidence numeric(6,4),
    method text,
    via_graph boolean DEFAULT false,
    reasoning text,
    details jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
    );

CREATE TABLE IF NOT EXISTS cv_unmapped_skills (
                                                  id bigserial PRIMARY KEY,
                                                  document_id text NOT NULL,
                                                  raw_skill text NOT NULL,
                                                  metadata jsonb DEFAULT '{}'::jsonb,
                                                  created_at timestamptz DEFAULT now()
    );

CREATE TABLE IF NOT EXISTS vac_unmapped_skills (
                                                   id bigserial PRIMARY KEY,
                                                   document_id text NOT NULL,
                                                   raw_skill text NOT NULL,
                                                   metadata jsonb DEFAULT '{}'::jsonb,
                                                   created_at timestamptz DEFAULT now()
    );

CREATE INDEX IF NOT EXISTS idx_cv_skill_mappings_document_id
    ON cv_skill_mappings(document_id);

CREATE INDEX IF NOT EXISTS idx_vac_skill_mappings_document_id
    ON vac_skill_mappings(document_id);

CREATE INDEX IF NOT EXISTS idx_cv_unmapped_skills_document_id
    ON cv_unmapped_skills(document_id);

CREATE INDEX IF NOT EXISTS idx_vac_unmapped_skills_document_id
    ON vac_unmapped_skills(document_id);