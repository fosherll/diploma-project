CREATE TABLE IF NOT EXISTS resume_mapping_links (
                                                    resume_id text PRIMARY KEY,
                                                    mapping_document_id text NOT NULL,
                                                    created_at timestamptz DEFAULT now()
    );

CREATE TABLE IF NOT EXISTS vacancy_mapping_links (
                                                     vacancy_id text PRIMARY KEY,
                                                     mapping_document_id text NOT NULL,
                                                     created_at timestamptz DEFAULT now()
    );

CREATE INDEX IF NOT EXISTS idx_resume_mapping_links_mapping_document_id
    ON resume_mapping_links(mapping_document_id);

CREATE INDEX IF NOT EXISTS idx_vacancy_mapping_links_mapping_document_id
    ON vacancy_mapping_links(mapping_document_id);