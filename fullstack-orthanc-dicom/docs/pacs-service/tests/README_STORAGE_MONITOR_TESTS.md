# Storage Monitor API Tests

This directory contains comprehensive tests for the Storage Monitor API endpoints.

## Overview

The Storage Monitor API provides real-time storage monitoring with alerts and historical tracking. These tests ensure all functionality works correctly and meets the specified requirements.

## Test Files

### Core Test Files

- **`test_storage_monitor_api.py`** - Main test suite for all storage monitor API endpoints
- **`test_storage_monitor_helpers.py`** - Helper functions and fixtures for testing
- **`integration/test_storage_monitor_integration.py`** - Integration tests with database and other components
- **`run_storage_monitor_tests.py`** - Comprehensive test runner script

### Test Coverage

The tests cover all requirements:

- **1.1** - Display storage usage dashboard
- **1.2** - Warning alert at 80%
- **1.3** - Critical notification at 90%
- **1.4** - Store history for trend analysis
- **1.5** - Storage usage per modality and time period

## API Endpoints Tested

| Method | Endpoint | Description | Test Status |
|--------|----------|-------------|-------------|
| GET | `/api/storage-monitor/stats` | Current storage statistics | ✅ |
| GET | `/api/storage-monitor/history` | Historical storage data | ✅ |
| GET | `/api/storage-monitor/by-modality` | Modality breakdown | ✅ |
| GET | `/api/storage-monitor/alerts` | Active alerts | ✅ |
| POST | `/api/storage-monitor/alerts/{id}/acknowledge` | Acknowledge alert | ✅ |
| POST | `/api/storage-monitor/snapshot` | Record snapshot | ✅ |
| GET | `/api/storage-monitor/summary` | Combined dashboard data | ✅ |

## Running Tests

### Quick Start

Run all storage monitor tests:

```bash
python tests/run_storage_monitor_tests.py
```

### Specific Test Types

Run only unit tests:
```bash
python tests/run_storage_monitor_tests.py --unit
```

Run only integration tests:
```bash
python tests/run_storage_monitor_tests.py --integration
```

Run only performance tests:
```bash
python tests/run_storage_monitor_tests.py --performance
```

### With Coverage

Generate coverage report:
```bash
python tests/run_storage_monitor_tests.py --coverage --report
```

### Direct pytest

Run specific test file:
```bash
pytest tests/test_storage_monitor_api.py -v
```

Run with verbose output:
```bash
pytest tests/test_storage_monitor_api.py -v --tb=short
```

### Multiple Python Versions

```bash
# Test with Python 3.9
python3.9 -m pytest tests/test_storage_monitor_api.py -v

# Test with Python 3.10
python3.10 -m pytest tests/test_storage_monitor_api.py -v

# Test with Python 3.11
python3.11 -m pytest tests/test_storage_monitor_api.py -v
```

## Test Categories

### Unit Tests

Validate individual components in isolation:

- Service methods (`StorageMonitorService`)
- Data validation and transformation
- Error handling scenarios
- Mock data generation

**Run:** `python tests/run_storage_monitor_tests.py --unit`

### Integration Tests

Test interactions between components:

- Database connectivity
- API endpoint integration
- Authentication and authorization
- Rate limiting
- Caching integration
- Audit logging

**Run:** `python tests/run_storage_monitor_tests.py --integration`

### Performance Tests

Validate performance under load:

- Response time benchmarks
- Concurrent access handling
- Memory usage optimization
- Database query optimization

**Run:** `python tests/run_storage_monitor_tests.py --performance`

## Test Data

### Mock Data Fixtures

The tests use comprehensive mock data:

- **Storage Statistics**: Realistic storage usage data
- **Historical Data**: 30+ days of historical records
- **Modality Stats**: All major DICOM modalities (CT, MR, US, CR, etc.)
- **Alerts**: Warning and critical alerts with proper timestamps
- **Study Data**: Realistic DICOM study information

### Data Validation

All test data includes:

- Proper data type validation
- Logical consistency checks
- Edge case testing
- Boundary value testing

## Test Scenarios

### Success Scenarios

- ✅ Valid API requests
- ✅ Database connectivity
- ✅ Alert generation and acknowledgment
- ✅ Historical data recording
- ✅ Modality-based statistics
- ✅ Concurrent access handling

### Error Scenarios

- ❌ Database connection failures
- ❌ Invalid request parameters
- ❌ Missing required data
- ❌ Authentication failures
- ❌ Rate limiting violations
- ❌ Filesystem access errors

### Edge Cases

- ⚠️ Empty database
- ⚠️ Zero storage usage
- ⚠️ 100% storage usage
- ⚠️ Large data volumes
- ⚠️ Concurrent modifications
- ⚠️ Network timeouts

## Test Configuration

### Environment Variables

Set these environment variables for testing:

```bash
# Database configuration
export DATABASE_URL=postgresql://testuser:testpass@localhost:5432/pacs_test

# Redis configuration
export REDIS_URL=redis://localhost:6379/0

# Storage configuration
export STORAGE_PATH=/var/lib/pacs/storage

# API configuration
export API_PREFIX=/api
export DEBUG=True
```

### Database Setup

```bash
# Create test database
createdb pacs_test

# Run migrations
python -m alembic upgrade head
```

## CI/CD Integration

### GitHub Actions

The tests are integrated into GitHub Actions:

- Automatic testing on push/PR
- Daily scheduled tests
- Multiple Python versions
- Coverage reporting
- Test result comments on PRs

### Workflow Triggers

- **Push**: Changes to storage monitor files
- **Pull Request**: Review changes before merge
- **Schedule**: Daily comprehensive testing

## Test Reports

### Coverage Reports

Generate HTML coverage report:
```bash
pytest --cov=app.services.storage_monitor --cov-report=html
```

### JSON Reports

Generate structured test reports:
```bash
python tests/run_storage_monitor_tests.py --report
```

### Performance Reports

Performance tests generate:
- Response time statistics
- Memory usage reports
- Concurrent access metrics

## Troubleshooting

### Common Issues

**Database Connection Errors:**
```bash
# Check database status
psql -h localhost -U testuser -d pacs_test -c "SELECT 1;"

# Reset database
dropdb pacs_test && createdb pacs_test
```

**Import Errors:**
```bash
# Install dependencies
pip install -r requirements.txt

# Add project to Python path
export PYTHONPATH=$PYTHONPATH:.
```

**Test Failures:**
```bash
# Run with verbose output
pytest tests/test_storage_monitor_api.py -v --tb=long

# Run specific test function
pytest tests/test_storage_monitor_api.py::TestStorageMonitorAPI::test_get_storage_stats_success -v
```

### Debug Mode

Enable debug logging:
```bash
export LOG_LEVEL=DEBUG
python tests/run_storage_monitor_tests.py --verbose
```

## Best Practices

### Testing Guidelines

1. **Arrange-Act-Assert**: Structure tests clearly
2. **Mock Dependencies**: Isolate components for unit tests
3. **Test Edge Cases**: Include boundary values and error conditions
4. **Validate Data**: Check both structure and content
5. **Performance**: Ensure tests run efficiently

### Code Quality

- Follow PEP 8 style guidelines
- Use descriptive test names
- Include docstrings for test functions
- Maintain test data consistency
- Regularly update test coverage

## Contributing

### Adding New Tests

1. Create test in appropriate file
2. Follow existing naming conventions
3. Include comprehensive test cases
4. Add test data to fixtures
5. Update documentation

### Test Maintenance

- Update tests when API changes
- Refresh mock data periodically
- Remove obsolete test cases
- Improve test coverage continuously

## Requirements Validation

Each test validates specific requirements:

| Test | Requirement | Validation |
|------|-------------|------------|
| `test_get_storage_stats_success` | 1.1 | ✅ Dashboard data provided |
| `test_get_storage_alerts_success` | 1.2 | ✅ Warning alerts at 80% |
| `test_critical_alert_threshold` | 1.3 | ✅ Critical alerts at 90% |
| `test_get_storage_history_success` | 1.4 | ✅ Historical data stored |
| `test_get_storage_by_modality_success` | 1.5 | ✅ Modality breakdown provided |

## Support

For questions about the Storage Monitor API tests:

- Check existing test files for examples
- Review the test runner script for usage
- Consult the main application documentation
- Contact the development team for assistance
