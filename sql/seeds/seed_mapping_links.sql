DELETE FROM resume_mapping_links;
DELETE FROM vacancy_mapping_links;

INSERT INTO vacancy_mapping_links (vacancy_id, mapping_document_id)
SELECT v.id, x.document_id
FROM vacancies v
         JOIN (
    SELECT metadata->>'title' AS title, MIN(document_id) AS document_id
    FROM vac_skill_mappings
    WHERE metadata->>'title' IS NOT NULL
    GROUP BY metadata->>'title'
) x
              ON x.title = v.title;

INSERT INTO vacancy_mapping_links (vacancy_id, mapping_document_id)
VALUES
    ('6348037', '6735160')
    ON CONFLICT (vacancy_id) DO NOTHING;

INSERT INTO resume_mapping_links (resume_id, mapping_document_id)
VALUES
    ('10001405', '14682931'),
    ('10001729', '10985368'),
    ('1000113',  '980817'),
    ('10002430', '14682931'),
    ('10001268', '10985368'),
    ('10000671', '980817')
    ON CONFLICT (resume_id) DO NOTHING;