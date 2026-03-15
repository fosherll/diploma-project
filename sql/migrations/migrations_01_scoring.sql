BEGIN;

-- run_id UUID (можно и без расширения, но пусть будет)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) criteria: критерии под конкретную вакансию (vacancy_id = TEXT)
CREATE TABLE IF NOT EXISTS criteria (
  id BIGSERIAL PRIMARY KEY,
  vacancy_id TEXT NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight NUMERIC(6,3) NOT NULL DEFAULT 1.0,
  calc_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT criteria_weight_nonneg CHECK (weight >= 0)
);

CREATE INDEX IF NOT EXISTS criteria_vacancy_id_idx ON criteria (vacancy_id);
CREATE INDEX IF NOT EXISTS criteria_enabled_idx ON criteria (vacancy_id, is_enabled);
CREATE INDEX IF NOT EXISTS criteria_config_gin_idx ON criteria USING GIN (config);

-- 2) evaluations: итоговая оценка резюме под вакансию
CREATE TABLE IF NOT EXISTS evaluations (
  id BIGSERIAL PRIMARY KEY,
  vacancy_id TEXT NOT NULL REFERENCES vacancies(id) ON DELETE CASCADE,
  resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  run_id UUID NOT NULL,
  total_score NUMERIC(10,4) NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT evaluations_unique_per_run UNIQUE (vacancy_id, resume_id, run_id)
);

CREATE INDEX IF NOT EXISTS evaluations_vacancy_run_idx ON evaluations (vacancy_id, run_id);
CREATE INDEX IF NOT EXISTS evaluations_vacancy_score_idx ON evaluations (vacancy_id, run_id, total_score DESC);
CREATE INDEX IF NOT EXISTS evaluations_resume_idx ON evaluations (resume_id);

-- 3) evaluation_details: детализация по критериям
CREATE TABLE IF NOT EXISTS evaluation_details (
  id BIGSERIAL PRIMARY KEY,
  evaluation_id BIGINT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  criteria_id BIGINT REFERENCES criteria(id) ON DELETE SET NULL,
  raw_score NUMERIC(10,4) NOT NULL,
  weighted_score NUMERIC(10,4) NOT NULL,
  explanation TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evaluation_details_eval_idx ON evaluation_details (evaluation_id);
CREATE INDEX IF NOT EXISTS evaluation_details_criteria_idx ON evaluation_details (criteria_id);

COMMIT;
