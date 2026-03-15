DELETE FROM criteria WHERE vacancy_id='6348037';

INSERT INTO criteria (vacancy_id, name, weight, calc_type, config) VALUES
('6348037', 'City match', 1.0, 'city_match', '{"city":"Kyiv"}'::jsonb),
('6348037', 'Keyword match', 2.0, 'keyword_match', '{"keywords":["call","support","sales","crm"]}'::jsonb),
('6348037', 'Has driver license', 0.2, 'bool_match', '{"field":"driver_license","truthy":["B","C","true","yes"]}'::jsonb);
