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
    $top = irm "$BaseUrl/vacancies/$VacancyId/top?limit=2"
    Show-Json $top

    $runId = $top.run_id
    $resumeId1 = $top.items[0].resume_id
    $resumeId2 = $top.items[1].resume_id

    if (-not $runId) {
        throw "run_id was not returned"
    }

    if (-not $resumeId1 -or -not $resumeId2) {
        throw "two resume ids were not returned"
    }

    Show-Section "2. compare"
    $compare = irm "$BaseUrl/vacancies/$VacancyId/compare/${resumeId1}/${resumeId2}?run_id=${runId}"
    Show-Json $compare

    if (-not $compare.items) {
        throw "compare items were not returned"
    }

    Write-Host ""
    Write-Host "COMPARE SMOKE TEST: OK"
}
catch {
    Write-Host ""
    Write-Host "COMPARE SMOKE TEST: FAILED"
    Write-Host $_.Exception.Message

    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
}