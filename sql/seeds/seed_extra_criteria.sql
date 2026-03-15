INSERT INTO criteria (vacancy_id, name, weight, calc_type, config, is_enabled)
VALUES
    (
        '6348037',
        'Salary match',
        1.500,
        'salary_match',
        '{"max_salary": 40000, "min_salary": 20000}',
        true
    ),
    (
        '6348037',
        'Experience match',
        1.300,
        'experience_match',
        '{"min_years": 2}',
        true
    );