$ErrorActionPreference = "Stop"

Write-Host "CV mappings count:"
docker exec -i diploma_postgres psql -U diploma -d diploma_db -c "select count(*) from cv_skill_mappings;"

Write-Host ""
Write-Host "VAC mappings count:"
docker exec -i diploma_postgres psql -U diploma -d diploma_db -c "select count(*) from vac_skill_mappings;"

Write-Host ""
Write-Host "CV unmapped count:"
docker exec -i diploma_postgres psql -U diploma -d diploma_db -c "select count(*) from cv_unmapped_skills;"

Write-Host ""
Write-Host "VAC unmapped count:"
docker exec -i diploma_postgres psql -U diploma -d diploma_db -c "select count(*) from vac_unmapped_skills;"

Write-Host ""
Write-Host "Sample CV mappings:"
docker exec -i diploma_postgres psql -U diploma -d diploma_db -c "select document_id, raw_skill, esco_label, confidence from cv_skill_mappings limit 10;"

Write-Host ""
Write-Host "Sample VAC mappings:"
docker exec -i diploma_postgres psql -U diploma -d diploma_db -c "select document_id, raw_skill, esco_label, confidence from vac_skill_mappings limit 10;"