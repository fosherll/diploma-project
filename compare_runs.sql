WITH a AS (
  SELECT resume_id, total_score
  FROM evaluations
  WHERE vacancy_id='6348037' AND run_id='c6ed500a-2264-4686-add3-b81cff59272e'
),
b AS (
  SELECT resume_id, total_score
  FROM evaluations
  WHERE vacancy_id='6348037' AND run_id='f5c1d28f-619b-44cd-ae20-7a24caa7ce46'
)
SELECT
  COALESCE(a.resume_id, b.resume_id) AS resume_id,
  a.total_score AS score_a,
  b.total_score AS score_b,
  (b.total_score - a.total_score) AS diff
FROM a FULL JOIN b USING(resume_id)
ORDER BY diff DESC NULLS LAST
LIMIT 50;
