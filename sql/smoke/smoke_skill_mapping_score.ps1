param(
    [string]$BaseUrl = "http://localhost:3001",
    [string]$VacancyId = "6348037"
)

$ErrorActionPreference = "Stop"

function Show-Section($title) {
    Write-Host ""
    Write-Host "=============================="
    Write-Host $title
    Write-Host "=============================="
}

function Show-Json($data) {
    $data | ConvertTo-Json -Depth 10
}

try {
    Show-Section "1. update criteria with skill mapping criterion"
    powershell -ExecutionPolicy Bypass -File .\sql\smoke\smoke_update_criteria.ps1

    Show-Section "2. run scoring"
    $body = @{
        limit = 20
        offset = 0
    } | ConvertTo-Json

    $scoreRes = irm "$BaseUrl/vacancies/$VacancyId/score" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body

    Show-Json $scoreRes

    $runId = $scoreRes.runId
    if (-not $runId) {
        throw "runId was not returned"
    }

    Show-Section "3. results"
    $results = irm "$BaseUrl/vacancies/$VacancyId/results?run_id=$runId&limit=5"
    Show-Json $results

    $topResumeId = $results[0].resume_id
    if (-not $topResumeId) {
        throw "top resume_id was not returned"
    }

    Show-Section "4. details of top result"
    $details = irm "$BaseUrl/vacancies/$VacancyId/results/${topResumeId}?run_id=${runId}"
    Show-Json $details

    $skillCriterion = $details.details | Where-Object { $_.calc_type -eq "skill_mapping_match" }

    if (-not $skillCriterion) {
        throw "skill_mapping_match details were not found"
    }

    Write-Host ""
    Write-Host "SKILL MAPPING SCORE SMOKE TEST: OK"
}
catch {
    Write-Host ""
    Write-Host "SKILL MAPPING SCORE SMOKE TEST: FAILED"
    Write-Host $_.Exception.Message

    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
}