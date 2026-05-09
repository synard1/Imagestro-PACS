# PACS Storage Advanced Features - Test Documentation

## Overview

Comprehensive test suite for validating all advanced storage features:
- ✅ Compression functionality
- ✅ Deduplication (hash-based)
- ✅ Storage quota enforcement
- ✅ Background jobs (Celery tasks)
- ✅ Bulk operations API
- ✅ Prometheus metrics
- ✅ End-to-end workflows

---

## Test Structure

```
tests/
├── unit/
│   └── test_storage_service_v2.py      # Unit tests for storage service
├── integration/
│   ├── test_background_jobs.py          # Integration tests for Celery tasks
│   ├── test_bulk_api.py                 # API integration tests
│   └── test_metrics_api.py              # Metrics API tests
├── e2e_test_suite.py                    # End-to-end test script
├── pytest.ini                            # Pytest configuration
└── README_TESTS.md                      # This file
```

---

## Quick Start

### 1. Install Test Dependencies

```bash
cd /home/apps/full-pacs/pacs-service
pip install pytest pytest-asyncio pytest-cov httpx
```

### 2. Run All Tests

```bash
# Run all unit tests
pytest tests/unit/ -v

# Run all integration tests
pytest tests/integration/ -v

# Run with coverage
pytest tests/ --cov=app --cov-report=html

# Run specific test file
pytest tests/unit/test_storage_service_v2.py -v
```

### 3. Run End-to-End Tests

```bash
# Make sure PACS service is running
python tests/e2e_test_suite.py

# Verbose mode
python tests/e2e_test_suite.py --verbose

# Skip cleanup
python tests/e2e_test_suite.py --skip-cleanup

# Different endpoint
python tests/e2e_test_suite.py --base-url http://localhost:8080
```

---

## Test Categories

### Unit Tests

**File:** `tests/unit/test_storage_service_v2.py`

**Tests:**
1. ✅ **Compression**
   - `test_compress_dicom_success` - Verify DICOM compression works
   - `test_compression_ratio_calculation` - Check compression ratio
   - `test_compression_only_if_beneficial` - Only compress when saves space

2. ✅ **Deduplication**
   - `test_duplicate_detection` - Detect duplicate by hash
   - `test_unique_file_not_deduplicated` - Unique files not skipped
   - `test_hash_calculation_consistency` - Hash is consistent

3. ✅ **Quota Enforcement**
   - `test_quota_exceeded_rejection` - Reject when quota exceeded
   - `test_quota_sufficient_acceptance` - Accept when space available
   - `test_usage_percentage_calculation` - Correct percentage calc

4. ✅ **Metadata Parsing**
   - `test_parse_valid_dicom` - Parse valid DICOM
   - `test_parse_invalid_file` - Handle invalid files

**Run:**
```bash
pytest tests/unit/test_storage_service_v2.py -v
```

### Integration Tests - Background Jobs

**File:** `tests/integration/test_background_jobs.py`

**Tests:**
1. ✅ **Cleanup Tasks**
   - `test_cleanup_orphan_files_dry_run` - Dry run orphan cleanup
   - `test_cleanup_orphan_files_actual` - Actual cleanup
   - `test_cleanup_deleted_files` - Delete old soft-deleted files
   - `test_verify_file_integrity` - Verify file hashes

2. ✅ **Migration Tasks**
   - `test_migrate_old_files_to_cold` - Auto-migrate to cold storage
   - `test_migrate_to_tier` - Manual tier migration
   - `test_rebalance_storage` - Rebalance across locations

3. ✅ **Storage Tasks**
   - `test_update_all_storage_stats` - Update all storage stats
   - `test_health_check_all_storages` - Health check
   - `test_task_scheduling` - Verify Celery beat schedule

**Run:**
```bash
pytest tests/integration/test_background_jobs.py -v
```

### Integration Tests - Bulk API

**File:** `tests/integration/test_bulk_api.py`

**Tests:**
1. ✅ **Bulk Upload**
   - `test_bulk_upload_multiple_files` - Upload multiple files
   - `test_bulk_upload_from_zip` - Upload from ZIP archive

2. ✅ **Bulk Download**
   - `test_bulk_download_files` - Download as ZIP

3. ✅ **Bulk Search**
   - `test_bulk_search_by_patient_id` - Search by patient
   - `test_bulk_search_by_date_range` - Search by date
   - `test_bulk_search_by_tier` - Search by tier

4. ✅ **Bulk Migration**
   - `test_bulk_migrate_to_cold` - Migrate to cold storage
   - `test_bulk_migrate_invalid_tier` - Validation

**Run:**
```bash
pytest tests/integration/test_bulk_api.py -v
```

### Integration Tests - Metrics API

**File:** `tests/integration/test_metrics_api.py`

**Tests:**
1. ✅ **Prometheus Metrics**
   - `test_metrics_endpoint_returns_prometheus_format`
   - `test_metrics_includes_storage_metrics`
   - `test_metrics_includes_dicom_metrics`

2. ✅ **JSON Metrics**
   - `test_json_metrics_endpoint`
   - `test_json_metrics_storage_structure`
   - `test_json_metrics_compression_stats`

3. ✅ **Health Check**
   - `test_health_check_endpoint`
   - `test_health_check_storage_locations`
   - `test_health_check_database_status`

**Run:**
```bash
pytest tests/integration/test_metrics_api.py -v
```

### End-to-End Tests

**File:** `tests/e2e_test_suite.py`

**Tests:**
1. ✅ Health Check
2. ✅ Prometheus Metrics
3. ✅ JSON Metrics
4. ✅ Single Upload with Compression
5. ✅ Duplicate Detection
6. ✅ Bulk Upload
7. ✅ Bulk Search
8. ✅ Storage Quota Check
9. ✅ Compression Statistics
10. ✅ Celery Worker Availability

**Run:**
```bash
python tests/e2e_test_suite.py
```

**Output:**
```
======================================================================
PACS Storage Advanced Features - E2E Test Suite
======================================================================

Testing endpoint: http://localhost:8003

[1/10] Running Health check endpoint...
✓ Health Check (status: healthy)

[2/10] Running Prometheus metrics endpoint...
✓ Prometheus Metrics (15234 bytes)

...

======================================================================
Test Summary
======================================================================

Total tests: 10
Passed: 10
Failed: 0

Success rate: 100.0%

======================================================================
🎉 All tests passed! Features are working correctly.
======================================================================
```

---

## Test Prerequisites

### For Unit Tests
- Python 3.12+
- pytest, pytest-asyncio
- pydicom

### For Integration Tests
- Database connection
- Storage locations configured
- Celery workers (for background job tests)

### For E2E Tests
- PACS service running (`http://localhost:8003`)
- Database accessible
- At least one storage location configured
- (Optional) Celery + Redis for background job tests

---

## Running Tests in CI/CD

### GitHub Actions Example

```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install pytest pytest-asyncio pytest-cov

      - name: Run unit tests
        run: pytest tests/unit/ -v

      - name: Run integration tests
        run: pytest tests/integration/ -v --cov=app

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## Manual Testing Checklist

### ✅ Feature 1: Compression

**Test Steps:**
1. Upload a DICOM file
2. Check metrics: `curl http://localhost:8003/api/metrics/json`
3. Verify `compression.compressed_files > 0`
4. Verify `compression.average_ratio > 1.0`

**Expected:**
- Files are automatically compressed
- Compression ratio tracked
- Space savings visible in metrics

### ✅ Feature 2: Deduplication

**Test Steps:**
1. Upload same DICOM file twice
2. Check database: `SELECT COUNT(*) FROM dicom_files WHERE file_hash = 'xxx'`
3. Should only have 1 record

**Expected:**
- Duplicate upload returns existing file
- No storage duplication
- `accessed_at` updated

### ✅ Feature 3: Storage Quotas

**Test Steps:**
1. Set quota: `UPDATE storage_locations SET max_size_gb = 1 WHERE id = 'xxx'`
2. Try uploading large file (>1GB)
3. Should be rejected

**Expected:**
- Upload rejected with quota error
- No file stored
- Usage percentage accurate

### ✅ Feature 4: Background Jobs

**Test Steps:**
1. Start Celery: `docker-compose -f docker-compose.celery.yml up -d`
2. Check Flower: `http://localhost:5555`
3. Trigger manual task:
   ```python
   from app.tasks.cleanup_tasks import cleanup_orphan_files
   result = cleanup_orphan_files.delay(dry_run=True)
   print(result.get())
   ```

**Expected:**
- Tasks appear in Flower
- Tasks execute successfully
- Results available

### ✅ Feature 5: Bulk Operations

**Test Steps:**
1. Upload multiple files:
   ```bash
   curl -X POST http://localhost:8003/api/bulk/upload \
     -F "files=@file1.dcm" \
     -F "files=@file2.dcm" \
     -F "files=@file3.dcm"
   ```
2. Check response for upload counts

**Expected:**
- All files uploaded
- Deduplication applied
- Results per-file

### ✅ Feature 6: Monitoring

**Test Steps:**
1. Check Prometheus: `curl http://localhost:8003/api/metrics`
2. Check JSON: `curl http://localhost:8003/api/metrics/json`
3. Check health: `curl http://localhost:8003/api/metrics/health`

**Expected:**
- Metrics available
- Storage stats accurate
- Health status correct

---

## Troubleshooting Tests

### Issue: Tests fail with database connection error

**Solution:**
```bash
# Check database connection
psql -h localhost -U postgres -d pacs

# Update DATABASE_URL in .env
export DATABASE_URL=postgresql://user:pass@localhost:5432/pacs
```

### Issue: Integration tests skip (marked as skip)

**Reason:** Some integration tests require full app context

**Solution:**
```bash
# Remove @pytest.mark.skip decorators
# Or run with specific database/services available
```

### Issue: E2E tests fail with connection refused

**Solution:**
```bash
# Make sure PACS service is running
cd /home/apps/full-pacs/pacs-service
uvicorn app.main:app --reload --port 8003

# Then run tests
python tests/e2e_test_suite.py
```

### Issue: Celery tests fail

**Solution:**
```bash
# Start Celery services
docker-compose -f docker-compose.celery.yml up -d

# Check workers
celery -A app.celery_app inspect active
```

---

## Code Coverage

### Generate Coverage Report

```bash
# Run tests with coverage
pytest tests/ --cov=app --cov-report=html --cov-report=term

# Open HTML report
open htmlcov/index.html
```

### Target Coverage

- **Unit Tests:** 90%+ for core storage service
- **Integration Tests:** 70%+ for API endpoints
- **Overall:** 80%+ code coverage

---

## Performance Benchmarks

### Expected Performance

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Single upload | < 2s | Time to upload 1MB DICOM |
| Bulk upload (10 files) | < 10s | Total time |
| Metrics endpoint | < 2s | Response time |
| Health check | < 1s | Response time |
| Orphan scan | < 30s | Per 1000 files |

### Run Performance Tests

```bash
# Time single upload
time curl -X POST http://localhost:8003/api/dicom/upload \
  -F "file=@test.dcm"

# Benchmark metrics endpoint
ab -n 100 -c 10 http://localhost:8003/api/metrics/json
```

---

## Continuous Testing

### Watch Mode (Development)

```bash
# Auto-run tests on file change
pytest-watch tests/unit/
```

### Pre-commit Hook

Create `.git/hooks/pre-commit`:
```bash
#!/bin/bash
pytest tests/unit/ -q
if [ $? -ne 0 ]; then
    echo "Unit tests failed. Commit aborted."
    exit 1
fi
```

---

## Test Data

### Sample DICOM Files

Tests create temporary DICOM files automatically. For manual testing:

```bash
# Download sample DICOM
wget https://www.rubomedical.com/dicom_files/CT-MONO2-16-ankle
mv CT-MONO2-16-ankle test_ct.dcm
```

### Cleanup Test Data

```bash
# Remove test files
rm -rf /tmp/pytest-*
rm -rf /tmp/tmp*.dcm

# Clear test database entries (if using test DB)
psql -d pacs_test -c "DELETE FROM dicom_files WHERE patient_id LIKE 'TEST%'"
```

---

## Contributing Tests

### Adding New Tests

1. **Unit Test Template:**
```python
@pytest.mark.asyncio
async def test_new_feature(self):
    """Test new feature"""
    # Setup
    db_mock = Mock()
    service = DicomStorageServiceV2(db_mock)

    # Execute
    result = await service.new_feature()

    # Assert
    assert result is not None
```

2. **Integration Test Template:**
```python
@pytest.mark.skip(reason="Requires database")
def test_new_api_endpoint(self):
    """Test new API endpoint"""
    response = client.get("/api/new-endpoint")

    assert response.status_code == 200
    assert 'expected_field' in response.json()
```

3. **E2E Test Template:**
```python
def test_new_workflow(self):
    """Test 11: New workflow"""
    try:
        # Test implementation
        self.success("New Workflow", "(details)")
    except Exception as e:
        self.fail("New Workflow", str(e))
```

---

**End of Test Documentation**

For questions or issues, refer to:
- Main docs: `/home/apps/full-pacs/PACS_STORAGE_ADVANCED_FEATURES.md`
- Source code: `/home/apps/full-pacs/pacs-service/`
