BEGIN;

CREATE TABLE IF NOT EXISTS vacancies_raw (
                                             id BIGSERIAL PRIMARY KEY,
                                             data JSONB NOT NULL,
                                             created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS vacancies_bad (
                                             id BIGSERIAL PRIMARY KEY,
                                             line TEXT NOT NULL,
                                             created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS vacancies (
                                         id TEXT PRIMARY KEY,
                                         url TEXT,
                                         title TEXT,
                                         location TEXT,
                                         employment_type TEXT,
                                         description_text TEXT,
                                         raw_html TEXT,
                                         payload JSONB,
                                         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS vacancies_title_idx
    ON vacancies (title);

CREATE INDEX IF NOT EXISTS vacancies_location_idx
    ON vacancies (location);

COMMIT;