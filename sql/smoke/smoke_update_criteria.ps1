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
    Show-Section "1. get current criteria"
    $before = irm "$BaseUrl/vacancies/$VacancyId/criteria"
    Show-Json $before

    Show-Section "2. update criteria"

    $bodyObject = @{
        items = @(
            @{
                name = "City match"
                weight = 1.2
                calc_type = "city_match"
                config = @{
                    city = "Kyiv"
                }
                is_enabled = $true
            },
            @{
                name = "Keyword match"
                weight = 2.5
                calc_type = "keyword_match"
                config = @{
                    keywords = @("sales", "crm", "support", "client")
                }
                is_enabled = $true
            },
            @{
                name = "Has driver license"
                weight = 0.2
                calc_type = "bool_match"
                config = @{
                    field = "driver_license"
                    truthy = @("B", "C", "true", "yes")
                }
                is_enabled = $true
            },
            @{
                name = "Salary match"
                weight = 1.5
                calc_type = "salary_match"
                config = @{
                    min_salary = 20000
                    max_salary = 40000
                }
                is_enabled = $true
            },
            @{
                name = "Experience match"
                weight = 1.3
                calc_type = "experience_match"
                config = @{
                    min_years = 2
                }
                is_enabled = $true
            },
            @{
                name = "Skill mapping match"
                weight = 2.8
                calc_type = "skill_mapping_match"
                config = @{
                    min_confidence = 0.7
                }
                is_enabled = $true
            }
        )
    }

    $body = $bodyObject | ConvertTo-Json -Depth 10

    $updated = irm "$BaseUrl/vacancies/$VacancyId/criteria" `
        -Method PUT `
        -ContentType "application/json" `
        -Body $body

    Show-Json $updated

    if ($updated.error) {
        throw $updated.error
    }

    Show-Section "3. get criteria after update"
    $after = irm "$BaseUrl/vacancies/$VacancyId/criteria"
    Show-Json $after

    Show-Section "4. run scoring after criteria update"
    $scoreBody = @{
        limit = 20
        offset = 0
    } | ConvertTo-Json

    $scoreRes = irm "$BaseUrl/vacancies/$VacancyId/score" `
        -Method POST `
        -ContentType "application/json" `
        -Body $scoreBody

    Show-Json $scoreRes

    if (-not $scoreRes.runId) {
        throw "runId was not returned after scoring"
    }

    $runId = $scoreRes.runId

    Show-Section "5. results after criteria update"
    $results = irm "$BaseUrl/vacancies/$VacancyId/results?run_id=$runId&limit=10"
    Show-Json $results

    Write-Host ""
    Write-Host "UPDATE CRITERIA SMOKE TEST: OK"
}
catch {
    Write-Host ""
    Write-Host "UPDATE CRITERIA SMOKE TEST: FAILED"
    Write-Host $_.Exception.Message

    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
}