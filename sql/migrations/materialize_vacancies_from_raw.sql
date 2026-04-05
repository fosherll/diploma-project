WITH prepared AS (
    SELECT
        vr.id AS raw_row_id,
        vr.created_at,
        COALESCE(
                vr.data->>'id',
            vr.data->>'vacancy_id',
            vr.data->>'_id'
        ) AS id,
        COALESCE(
                vr.data->>'url',
            vr.data->>'link'
        ) AS url,
        COALESCE(
                vr.data->>'title',
            vr.data->>'name'
        ) AS title,
        COALESCE(
                vr.data->>'location',
            vr.data->>'city',
            vr.data->>'address'
        ) AS location,
        COALESCE(
                vr.data->>'employment_type',
            vr.data->>'employment',
            vr.data->>'work_format'
        ) AS employment_type,
        COALESCE(
                vr.data->>'description_text',
            vr.data->>'description',
            vr.data->>'markdown'
        ) AS description_text,
        COALESCE(
                vr.data->>'raw_html',
            vr.data->>'html'
        ) AS raw_html,
        vr.data AS payload
    FROM vacancies_raw vr
),
     dedup AS (
         SELECT DISTINCT ON (id)
    id,
    url,
    title,
    location,
    employment_type,
    description_text,
    raw_html,
    payload
FROM prepared
WHERE id IS NOT NULL
ORDER BY id, raw_row_id DESC
    )
INSERT INTO vacancies (
    id,
    url,
    title,
    location,
    employment_type,
    description_text,
    raw_html,
    payload
)
SELECT
    id,
    url,
    title,
    location,
    employment_type,
    description_text,
    raw_html,
    payload
FROM dedup
    ON CONFLICT (id) DO UPDATE SET
    url = EXCLUDED.url,
                            title = EXCLUDED.title,
                            location = EXCLUDED.location,
                            employment_type = EXCLUDED.employment_type,
                            description_text = EXCLUDED.description_text,
                            raw_html = EXCLUDED.raw_html,
                            payload = EXCLUDED.payload;