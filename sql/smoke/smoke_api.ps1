$ErrorActionPreference = "Stop"

# ==============================
# НАСТРОЙКИ
# ==============================
$base = "http://localhost:3001"
$vac  = "6348037"

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
    Show-Section "health"
    $health = irm "$base/health"
    Show-Json $health

    Show-Section "vacancies (limit=3)"
    $vacancies = irm "$base/vacancies?limit=3"
    Show-Json $vacancies

    Show-Section "criteria (get)"
    $criteria = irm "$base/vacancies/$vac/criteria"
    Show-Json $criteria

    Show-Section "runs"
    $runs = irm "$base/vacancies/$vac/runs"
    Show-Json $runs

    Write-Host ""
    Write-Host "SMOKE TEST: OK"
}
catch {
    Write-Host ""
    Write-Host "SMOKE TEST: FAILED"
    Write-Host $_.Exception.Message

    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
}