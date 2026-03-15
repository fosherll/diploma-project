param(
    [string]$BaseUrl = "http://localhost:3001",
    [string]$VacancyId = "6348037",
    [int]$Limit = 20
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

function Normalize-ToArray($obj) {
    if ($null -eq $obj) { return @() }
    if ($obj -is [System.Array]) { return $obj }
    if ($obj.PSObject.Properties.Name -contains "value") { return @($obj.value) }
    return @($obj)
}

try {
    Show-Section "1. health"
    $health = irm "$BaseUrl/health"
    Show-Json $health

    Show-Section "2. start scoring"
    $body = @{
        limit = $Limit
        offset = 0
    } | ConvertTo-Json

    $scoreRes = irm "$BaseUrl/vacancies/$VacancyId/score" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body

    Show-Json $scoreRes

    if (-not $scoreRes.runId) {
        throw "runId was not returned from scoring endpoint"
    }

    $runId = $scoreRes.runId
    Write-Host ""
    Write-Host "Created runId: $runId"

    Show-Section "3. runs"
    $runs = irm "$BaseUrl/vacancies/$VacancyId/runs"
    Show-Json $runs

    Show-Section "4. results"
    $resultsUrl = "${BaseUrl}/vacancies/${VacancyId}/results?run_id=${runId}&limit=10"
    $resultsRaw = irm $resultsUrl
    $results = Normalize-ToArray $resultsRaw
    Show-Json $results

    if ($results.Count -eq 0) {
        throw "No results returned for run_id=$runId"
    }

    $firstResumeId = $results[0].resume_id
    Write-Host ""
    Write-Host "Top resume_id: $firstResumeId"

    Show-Section "5. details for top candidate"
    $detailsUrl = "${BaseUrl}/vacancies/${VacancyId}/results/${firstResumeId}?run_id=${runId}"
    $details = irm $detailsUrl
    Show-Json $details

    if ($details.error) {
        throw $details.error
    }

    if (-not $details.details -or $details.details.Count -eq 0) {
        throw "No details returned for top candidate"
    }

    Write-Host ""
    Write-Host "SCORING SMOKE TEST: OK"
}
catch {
    Write-Host ""
    Write-Host "SCORING SMOKE TEST: FAILED"
    Write-Host $_.Exception.Message

    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
}