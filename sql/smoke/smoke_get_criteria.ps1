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

try {
    Show-Section "criteria"
    $criteria = irm "$BaseUrl/vacancies/$VacancyId/criteria"
    $criteria | ConvertTo-Json -Depth 10
}
catch {
    Write-Host "FAILED"
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
}