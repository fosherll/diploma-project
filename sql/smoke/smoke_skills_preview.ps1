param(
    [string]$BaseUrl = "http://localhost:3001",
    [string]$VacancyId = "6348037",
    [string]$ResumeId = "10001405"
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
    Show-Section "skills preview"
    $preview = irm "$BaseUrl/vacancies/$VacancyId/skills-preview/$ResumeId"
    Show-Json $preview

    if (-not $preview.matched) {
        throw "matched skills were not returned"
    }

    Write-Host ""
    Write-Host "SKILLS PREVIEW SMOKE TEST: OK"
}
catch {
    Write-Host ""
    Write-Host "SKILLS PREVIEW SMOKE TEST: FAILED"
    Write-Host $_.Exception.Message

    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
}