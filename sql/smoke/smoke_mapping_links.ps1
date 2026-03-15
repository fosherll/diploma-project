$ErrorActionPreference = "Stop"

Write-Host "Resume mapping links:"
docker exec -i diploma_postgres psql -U diploma -d diploma_db -c "select * from resume_mapping_links order by resume_id;"

Write-Host ""
Write-Host "Vacancy mapping links:"
docker exec -i diploma_postgres psql -U diploma -d diploma_db -c "select * from vacancy_mapping_links order by vacancy_id;"