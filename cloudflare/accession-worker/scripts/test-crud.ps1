# Accession Worker - Full CRUD Test Script
# Tests all endpoints against deployed worker

$BASE_URL = "https://accession-worker.xolution.workers.dev"
$TENANT_ID = "test-tenant-001"
$HEADERS = @{ "Content-Type" = "application/json"; "X-Tenant-ID" = $TENANT_ID }
$passed = 0; $failed = 0; $total = 0

function Test-EP($Name, $Method, $Url, $H, $Body, $Expected, $Check) {
    $script:total++
    Write-Host "`n--- TEST $script:total : $Name ---" -ForegroundColor Cyan
    Write-Host "  $Method $Url"
    try {
        $p = @{ Uri=$Url; Method=$Method; Headers=$H; ErrorAction="Stop" }
        if ($Body) { $p.Body = $Body }
        $r = Invoke-WebRequest @p
        $s = $r.StatusCode
        $c = $r.Content | ConvertFrom-Json -EA SilentlyContinue
    } catch {
        $s = [int]$_.Exception.Response.StatusCode
        try { $c = $_.ErrorDetails.Message | ConvertFrom-Json -EA SilentlyContinue } catch { $c = $null }
    }
    Write-Host "  Status: $s (expected: $Expected)"
    if ($s -eq $Expected) {
        if ($Check -and $c) {
            if (& $Check $c) { Write-Host "  PASSED" -ForegroundColor Green; $script:passed++ }
            else { Write-Host "  FAILED (validation)" -ForegroundColor Red; $script:failed++ }
        } else { Write-Host "  PASSED" -ForegroundColor Green; $script:passed++ }
    } else { Write-Host "  FAILED" -ForegroundColor Red; $script:failed++ }
    return $c
}

Write-Host "`n=== ACCESSION WORKER CRUD TEST ===" -ForegroundColor Yellow
Write-Host "URL: $BASE_URL"
Write-Host "Tenant: $TENANT_ID`n"

# 1. Health
Test-EP "GET /healthz" "GET" "$BASE_URL/healthz" @{} $null 200 { param($r) $r.status -in @("ok","degraded") }
Test-EP "GET /readyz" "GET" "$BASE_URL/readyz" @{} $null 200 { param($r) $true }

# 2. Auth - no auth should 401
Test-EP "No auth (401)" "GET" "$BASE_URL/api/accessions" @{"Content-Type"="application/json"} $null 401 $null

# 3. Create nested
$body1 = '{"patient":{"id":"3201234567890123","name":"John Doe Test","ihs_number":"P12345678901","birth_date":"1990-05-15","sex":"male"},"modality":"CT","procedure_code":"CT-HEAD-001","procedure_name":"CT Head","facility_code":"RS01","note":"test"}'
$r1 = Test-EP "POST /api/accessions (create)" "POST" "$BASE_URL/api/accessions" $HEADERS $body1 201 { param($r) $r.id -and $r.accession_number }
$AN = $r1.accession_number
Write-Host "  Created: $AN" -ForegroundColor DarkGray

# 4. Create flat/legacy
$body2 = '{"patient_national_id":"3201234567890456","patient_name":"Jane Legacy","modality":"MR","procedure_code":"MR-BRAIN"}'
$r2 = Test-EP "POST /accession/create (legacy)" "POST" "$BASE_URL/accession/create" $HEADERS $body2 201 { param($r) $r.id -and $r.accession_number }
Write-Host "  Created: $($r2.accession_number)" -ForegroundColor DarkGray

# 5. Create external
$body3 = '{"patient":{"id":"3201234567890789","name":"External Patient"},"modality":"DX","accession_number":"SIMRS-EXT-' + (Get-Date -Format 'yyyyMMddHHmmss') + '","procedure_code":"DX-CHEST"}'
Test-EP "POST external accession" "POST" "$BASE_URL/api/accessions" $HEADERS $body3 201 { param($r) $r.source -eq "external" }

# 6. Get single
if ($AN) { Test-EP "GET single accession" "GET" "$BASE_URL/api/accessions/$AN" $HEADERS $null 200 { param($r) $r.accession_number -eq $AN } }

# 7. List
Test-EP "GET list accessions" "GET" "$BASE_URL/api/accessions" $HEADERS $null 200 { param($r) $null -ne $r.items }

# 8. List with filters
Test-EP "GET list ?modality=CT" "GET" "$BASE_URL/api/accessions?modality=CT" $HEADERS $null 200 { param($r) $null -ne $r.items }
Test-EP "GET list ?source=external" "GET" "$BASE_URL/api/accessions?source=external" $HEADERS $null 200 { param($r) $null -ne $r.items }
Test-EP "GET list ?limit=2" "GET" "$BASE_URL/api/accessions?limit=2" $HEADERS $null 200 { param($r) $null -ne $r.items }

# 9. Patch
if ($AN) {
    $patchBody = '{"patient_name":"John Updated","note":"patched"}'
    Test-EP "PATCH update fields" "PATCH" "$BASE_URL/api/accessions/$AN" $HEADERS $patchBody 200 { param($r) $r.patient_name -eq "John Updated" }
}

# 10. Patch immutable (should 400)
if ($AN) {
    $patchBad = '{"accession_number":"FAIL","modality":"MR"}'
    Test-EP "PATCH immutable fields (400)" "PATCH" "$BASE_URL/api/accessions/$AN" $HEADERS $patchBad 400 $null
}

# 11. Delete without confirm (400)
if ($AN) { Test-EP "DELETE no confirm (400)" "DELETE" "$BASE_URL/api/accessions/$AN" $HEADERS $null 400 $null }

# 12. Delete with confirm (403 expected - Service Binding trust has no roles)
if ($AN) { Test-EP "DELETE with confirm (403 no role)" "DELETE" "$BASE_URL/api/accessions/${AN}?confirm=true" $HEADERS $null 403 $null }

# 13-14. Skip delete-dependent tests (need JWT with admin role)
Write-Host "`n--- SKIPPED: Tests 13-14 require JWT with admin/data_steward role ---" -ForegroundColor DarkGray

# 15. Batch create
$batchBody = '{"procedures":[{"patient_national_id":"3201234567891111","patient_name":"Batch 1","modality":"US","procedure_code":"US-ABD"},{"patient_national_id":"3201234567892222","patient_name":"Batch 2","modality":"CT","procedure_code":"CT-THX"},{"patient_national_id":"3201234567893333","patient_name":"Batch 3","modality":"MR","procedure_code":"MR-SPN","accession_number":"BATCH-EXT-' + (Get-Date -Format 'HHmmss') + '"}]}'
Test-EP "POST batch (3 procedures)" "POST" "$BASE_URL/api/accessions/batch" $HEADERS $batchBody 201 { param($r) $r.accessions.Count -eq 3 }

# 16. Batch duplicate code (400)
$batchDup = '{"procedures":[{"patient_national_id":"3201234567891111","patient_name":"D1","modality":"CT","procedure_code":"SAME"},{"patient_national_id":"3201234567892222","patient_name":"D2","modality":"CT","procedure_code":"SAME"}]}'
Test-EP "POST batch dup code (400)" "POST" "$BASE_URL/api/accessions/batch" $HEADERS $batchDup 400 $null

# 17. Idempotency
$idemKey = "idem-$(Get-Date -Format yyyyMMddHHmmss)"
$idemH = @{ "Content-Type"="application/json"; "X-Tenant-ID"=$TENANT_ID; "X-Idempotency-Key"=$idemKey }
$idemBody = '{"patient":{"id":"3201234567894444","name":"Idem Test"},"modality":"NM","procedure_code":"NM-BONE"}'
$ir1 = Test-EP "POST with idempotency (201)" "POST" "$BASE_URL/api/accessions" $idemH $idemBody 201 { param($r) $r.accession_number }
$ir2 = Test-EP "POST same idem key (200)" "POST" "$BASE_URL/api/accessions" $idemH $idemBody 200 { param($r) $r.accession_number -eq $ir1.accession_number }

# 18. Settings
Test-EP "GET settings" "GET" "$BASE_URL/settings/accession_config" $HEADERS $null 200 { param($r) $r.pattern }

# 19. Validation errors
$badBody = '{"patient":{"id":"123","name":""},"modality":"INVALID"}'
Test-EP "POST invalid input (400)" "POST" "$BASE_URL/api/accessions" $HEADERS $badBody 400 $null

# 20. Not found
Test-EP "GET nonexistent (404)" "GET" "$BASE_URL/api/accessions/NONEXISTENT-999" $HEADERS $null 404 $null

# Summary
Write-Host "`n=== RESULTS ===" -ForegroundColor Yellow
Write-Host "Total: $total | Passed: $passed | Failed: $failed"
if ($failed -eq 0) { Write-Host "ALL TESTS PASSED!" -ForegroundColor Green }
else { Write-Host "$failed TEST(S) FAILED" -ForegroundColor Red; exit 1 }
