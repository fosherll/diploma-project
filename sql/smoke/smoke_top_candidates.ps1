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
    $top = irm "$BaseUrl/vacancies/$VacancyId/top?limit=10"
    Show-Json $top

    if (-not $top.run_id) {
        throw "run_id was not returned"
    }

    if (-not $top.items -or $top.items.Count -eq 0) {
        throw "top items are empty"
    }

    Show-Section "2. details for first top candidate"
    $resumeId = $top.items[0].resume_id
    $details = irm "$BaseUrl/vacancies/$VacancyId/results/${resumeId}?run_id=$($top.run_id)"
    Show-Json $details

    Write-Host ""
    Write-Host "TOP CANDIDATES SMOKE TEST: OK"
}
catch {
    Write-Host ""
    Write-Host "TOP CANDIDATES SMOKE TEST: FAILED"
    Write-Host $_.Exception.Message

    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
}