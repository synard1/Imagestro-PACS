# Reset Database Script
# This script will reset the PostgreSQL database to fix schema issues

Write-Host "🔄 Resetting PostgreSQL Database..." -ForegroundColor Yellow

# Stop the containers
Write-Host "1. Stopping containers..." -ForegroundColor Cyan
docker-compose down

# Remove the postgres data volume
Write-Host "2. Removing old database data..." -ForegroundColor Cyan
if (Test-Path ".\data\postgres") {
    Remove-Item -Recurse -Force ".\data\postgres"
    Write-Host "   ✓ Old database data removed" -ForegroundColor Green
} else {
    Write-Host "   ✓ No existing database data found" -ForegroundColor Green
}

# Recreate the postgres data directory
Write-Host "3. Creating fresh database directory..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path ".\data\postgres" -Force | Out-Null
Write-Host "   ✓ Fresh database directory created" -ForegroundColor Green

# Start the containers
Write-Host "4. Starting containers with fresh database..." -ForegroundColor Cyan
docker-compose up -d postgres

# Wait for database to be ready
Write-Host "5. Waiting for database to initialize..." -ForegroundColor Cyan
Start-Sleep -Seconds 10

# Start auth service
Write-Host "6. Starting auth service..." -ForegroundColor Cyan
docker-compose up -d auth-service

Write-Host "✅ Database reset completed!" -ForegroundColor Green
Write-Host "The auth service should now start without role_id errors." -ForegroundColor White