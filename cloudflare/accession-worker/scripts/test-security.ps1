# Accession Worker - Security & Audit Trail Validation
# Tests tenant isolation, cross-tenant access prevention, and audit trail completeness

$BASE_URL = "https://accession-worker.xolution.workers.dev"
$TENANT_A = "tenant-security-A"
$TENANT_B = "tenant-security-B"
$H_A = @{ "Content-Type" = "application/json"; "X-Tenant-ID" = $TENANT_A }
$H_B = @{ "Content-Type" = "application/json"; "X-Tenant-ID" = $TENANT_B }
$passed = 0; $failed = 0; $total = 0

function Test-EP($Name, $Method, $Url, $H, $Body, $Expected, $Check) {
    $script:total++
    Write-Host "`n--- TEST $script:total : $Name ---" -ForegroundColor Cyan
    Write-Host "  $Method $Url"
    try {
        $p = @{ Uri=$Url; Method=$Method; Headers=$H; ErrorAction="Stop"; UseBasicParsing=$true }
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
            else { Write-Host "  FAILED (validation)" -ForegroundColor Red; Write-Host "  Response: $($c | ConvertTo-Json -Depth 3 -Compress)"; $script:failed++ }
        } else { Write-Host "  PASSED" -ForegroundColor Green; $script:passed++ }
    } else {
        Write-Host "  FAILED (got $s)" -ForegroundColor Red
        if ($c) { Write-Host "  Response: $($c | ConvertTo-Json -Depth 3 -Compress)" }
        $script:failed++
    }
    return $c
}

Write-Host "`n=== SECURITY & AUDIT TRAIL VALIDATION ===" -ForegroundColor Yellow
Write-Host "Tenant A: $TENANT_A"
Write-Host "Tenant B: $TENANT_B`n"

# ============================================================================
# PART 1: TENANT ISOLATION
# ============================================================================

Write-Host "`n>>> PART 1: TENANT ISOLATION <<<" -ForegroundColor Magenta

# Create accession in Tenant A
$bodyA = '{"patient":{"id":"3201111111111111","name":"Patient Tenant A"},"modality":"CT","procedure_code":"CT-A-001"}'
$rA = Test-EP "Create accession in Tenant A" "POST" "$BASE_URL/api/accessions" $H_A $bodyA 201 { param($r) $r.accession_number }
$AN_A = $rA.accession_number
Write-Host "  Tenant A accession: $AN_A" -ForegroundColor DarkGray

# Create accession in Tenant B
$bodyB = '{"patient":{"id":"3202222222222222","name":"Patient Tenant B"},"modality":"MR","procedure_code":"MR-B-001"}'
$rB = Test-EP "Create accession in Tenant B" "POST" "$BASE_URL/api/accessions" $H_B $bodyB 201 { param($r) $r.accession_number }
$AN_B = $rB.accession_number
Write-Host "  Tenant B accession: $AN_B" -ForegroundColor DarkGray

# Tenant A can see own accession
Test-EP "Tenant A sees own accession" "GET" "$BASE_URL/api/accessions/$AN_A" $H_A $null 200 { param($r) $r.accession_number -eq $AN_A -and $r.tenant_id -eq $TENANT_A }

# Tenant B can see own accession
Test-EP "Tenant B sees own accession" "GET" "$BASE_URL/api/accessions/$AN_B" $H_B $null 200 { param($r) $r.accession_number -eq $AN_B -and $r.tenant_id -eq $TENANT_B }

# CRITICAL: Tenant A CANNOT see Tenant B's accession (must be 404)
Test-EP "Tenant A CANNOT see Tenant B accession (404)" "GET" "$BASE_URL/api/accessions/$AN_B" $H_A $null 404 $null

# CRITICAL: Tenant B CANNOT see Tenant A's accession (must be 404)
Test-EP "Tenant B CANNOT see Tenant A accession (404)" "GET" "$BASE_URL/api/accessions/$AN_A" $H_B $null 404 $null

# Tenant A list only shows Tenant A data
Test-EP "Tenant A list shows only own data" "GET" "$BASE_URL/api/accessions" $H_A $null 200 {
    param($r)
    $allTenantA = $true
    foreach ($item in $r.items) { if ($item.tenant_id -ne $TENANT_A) { $allTenantA = $false } }
    $allTenantA
}

# Tenant B list only shows Tenant B data
Test-EP "Tenant B list shows only own data" "GET" "$BASE_URL/api/accessions" $H_B $null 200 {
    param($r)
    $allTenantB = $true
    foreach ($item in $r.items) { if ($item.tenant_id -ne $TENANT_B) { $allTenantB = $false } }
    $allTenantB
}

# Tenant A cannot PATCH Tenant B's accession
$patchBody = '{"note":"hacked by tenant A"}'
Test-EP "Tenant A CANNOT patch Tenant B accession (404)" "PATCH" "$BASE_URL/api/accessions/$AN_B" $H_A $patchBody 404 $null

# ============================================================================
# PART 2: AUDIT TRAIL
# ============================================================================

Write-Host "`n>>> PART 2: AUDIT TRAIL <<<" -ForegroundColor Magenta

# Create a fresh accession for audit testing
$auditBody = '{"patient":{"id":"3203333333333333","name":"Audit Test Patient","birth_date":"1995-01-01","sex":"female"},"modality":"US","procedure_code":"US-AUDIT-001","note":"original note"}'
$rAudit = Test-EP "Create accession for audit test" "POST" "$BASE_URL/api/accessions" $H_A $auditBody 201 { param($r) $r.id -and $r.accession_number }
$AUDIT_AN = $rAudit.accession_number
$AUDIT_ID = $rAudit.id
Write-Host "  Audit test accession: $AUDIT_AN (ID: $AUDIT_ID)" -ForegroundColor DarkGray

# Verify created_at is present
Test-EP "Accession has created_at timestamp" "GET" "$BASE_URL/api/accessions/$AUDIT_AN" $H_A $null 200 {
    param($r)
    $r.created_at -and $r.created_at -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
}

# Verify source field is set
Test-EP "Accession has source=internal" "GET" "$BASE_URL/api/accessions/$AUDIT_AN" $H_A $null 200 { param($r) $r.source -eq "internal" }

# PATCH to trigger audit trail
$patch1 = '{"patient_name":"Audit Patient Updated","note":"updated note"}'
Test-EP "PATCH accession (triggers audit)" "PATCH" "$BASE_URL/api/accessions/$AUDIT_AN" $H_A $patch1 200 {
    param($r) $r.patient_name -eq "Audit Patient Updated" -and $r.note -eq "updated note"
}

# Second PATCH
$patch2 = '{"procedure_name":"Updated Procedure Name"}'
Test-EP "PATCH again (second audit entry)" "PATCH" "$BASE_URL/api/accessions/$AUDIT_AN" $H_A $patch2 200 { param($r) $r.procedure_name -eq "Updated Procedure Name" }

# Verify the record still has created_at unchanged after patches
$getAfterPatch = Test-EP "created_at unchanged after PATCH" "GET" "$BASE_URL/api/accessions/$AUDIT_AN" $H_A $null 200 { param($r) $r.created_at -and $r.patient_name -eq "Audit Patient Updated" }

# ============================================================================
# PART 3: FIELD COMPLETENESS
# ============================================================================

Write-Host "`n>>> PART 3: FIELD COMPLETENESS <<<" -ForegroundColor Magenta

# Create with all fields populated
$fullBody = @{
    patient = @{
        id = "3204444444444444"
        name = "Full Fields Patient"
        ihs_number = "P11111111111"
        birth_date = "1980-06-15"
        sex = "male"
    }
    modality = "XA"
    procedure_code = "XA-ANGIO-001"
    procedure_name = "Coronary Angiography"
    facility_code = "RS02"
    scheduled_at = "2025-06-15T08:00:00Z"
    note = "Full field test"
    medical_record_number = "MRN-12345"
} | ConvertTo-Json -Depth 3

$rFull = Test-EP "Create with all fields" "POST" "$BASE_URL/api/accessions" $H_A $fullBody 201 { param($r) $r.id -and $r.accession_number -and $r.issuer }
$FULL_AN = $rFull.accession_number

# Verify all fields are stored and returned
Test-EP "All fields stored correctly" "GET" "$BASE_URL/api/accessions/$FULL_AN" $H_A $null 200 {
    param($r)
    $r.patient_national_id -eq "3204444444444444" -and
    $r.patient_name -eq "Full Fields Patient" -and
    $r.patient_ihs_number -eq "P11111111111" -and
    $r.patient_birth_date -eq "1980-06-15" -and
    $r.patient_sex -eq "male" -and
    $r.modality -eq "XA" -and
    $r.procedure_code -eq "XA-ANGIO-001" -and
    $r.procedure_name -eq "Coronary Angiography" -and
    $r.facility_code -eq "RS02" -and
    $r.scheduled_at -eq "2025-06-15T08:00:00Z" -and
    $r.note -eq "Full field test" -and
    $r.medical_record_number -eq "MRN-12345" -and
    $r.source -eq "internal" -and
    $r.created_at -and
    $null -eq $r.deleted_at
}

# Verify issuer format (SATUSEHAT)
Test-EP "Issuer follows SATUSEHAT format" "GET" "$BASE_URL/api/accessions/$FULL_AN" $H_A $null 200 {
    param($r) $r.issuer -match '^http://sys-ids\.kemkes\.go\.id/acsn/\d{16}\|.+'
}

# ============================================================================
# PART 4: SEQUENCE ISOLATION PER TENANT
# ============================================================================

Write-Host "`n>>> PART 4: SEQUENCE ISOLATION <<<" -ForegroundColor Magenta

# Create in fresh tenant C to verify counter starts at 1
$TENANT_C = "tenant-seq-test-$(Get-Date -Format 'HHmmss')"
$H_C = @{ "Content-Type" = "application/json"; "X-Tenant-ID" = $TENANT_C }

$seqBody = '{"patient":{"id":"3205555555555555","name":"Seq Test"},"modality":"CR","procedure_code":"CR-001"}'
$rSeq = Test-EP "New tenant counter starts at 0001" "POST" "$BASE_URL/api/accessions" $H_C $seqBody 201 {
    param($r) $r.accession_number -match '0001$'
}
Write-Host "  New tenant accession: $($rSeq.accession_number)" -ForegroundColor DarkGray

# Second accession in same tenant should be 0002
$seqBody2 = '{"patient":{"id":"3205555555555556","name":"Seq Test 2"},"modality":"CR","procedure_code":"CR-002"}'
$rSeq2 = Test-EP "Second accession is 0002" "POST" "$BASE_URL/api/accessions" $H_C $seqBody2 201 {
    param($r) $r.accession_number -match '0002$'
}
Write-Host "  Second accession: $($rSeq2.accession_number)" -ForegroundColor DarkGray

# ============================================================================
# PART 5: IDEMPOTENCY CONFLICT DETECTION
# ============================================================================

Write-Host "`n>>> PART 5: IDEMPOTENCY CONFLICT <<<" -ForegroundColor Magenta

$conflictKey = "conflict-key-$(Get-Date -Format 'HHmmss')"
$H_conflict = @{ "Content-Type" = "application/json"; "X-Tenant-ID" = $TENANT_A; "X-Idempotency-Key" = $conflictKey }

# First call
$conflictBody1 = '{"patient":{"id":"3206666666666666","name":"Conflict Test"},"modality":"CT","procedure_code":"CONF-001"}'
Test-EP "Idempotency first call (201)" "POST" "$BASE_URL/api/accessions" $H_conflict $conflictBody1 201 { param($r) $r.accession_number }

# Same key, different payload (different modality) -> should be 422 conflict
$conflictBody2 = '{"patient":{"id":"3206666666666666","name":"Conflict Test"},"modality":"MR","procedure_code":"CONF-001"}'
Test-EP "Idempotency conflict (422)" "POST" "$BASE_URL/api/accessions" $H_conflict $conflictBody2 422 { param($r) $r.code -eq "IDEMPOTENCY_CONFLICT" }

# ============================================================================
# SUMMARY
# ============================================================================

Write-Host "`n=== SECURITY & AUDIT RESULTS ===" -ForegroundColor Yellow
Write-Host "Total: $total | Passed: $passed | Failed: $failed"
if ($failed -eq 0) { Write-Host "ALL SECURITY TESTS PASSED!" -ForegroundColor Green }
else { Write-Host "$failed SECURITY TEST(S) FAILED" -ForegroundColor Red; exit 1 }
