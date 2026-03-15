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
    Show-Section "1. top candidates"
    $top = irm "$BaseUrl/vacancies/$VacancyId/top?limit=1"
    Show-Json $top

    $runId = $top.run_id
    $resumeId = $top.items[0].resume_id

    if (-not $runId) {
        throw "run_id was not returned"
    }

    if (-not $resumeId) {
        throw "resume_id was not returned"
    }

    Show-Section "2. candidate summary"
    $summary = irm "$BaseUrl/vacancies/$VacancyId/summary/${resumeId}?run_id=${runId}"
    Show-Json $summary

    if (-not $summary.strengths) {
        throw "strengths were not returned"
    }

    Write-Host ""
    Write-Host "SUMMARY SMOKE TEST: OK"
}
catch {
    Write-Host ""
    Write-Host "SUMMARY SMOKE TEST: FAILED"
    Write-Host $_.Exception.Message

    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
}