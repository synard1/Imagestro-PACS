@echo off
REM Doctor Data Seeder Runner for Windows
REM Runs the doctor data seeder with proper environment setup

echo ================================================================================
echo Doctor Data Seeder - Windows
echo ================================================================================
echo.

REM Set default environment variables if not already set
if not defined POSTGRES_HOST set POSTGRES_HOST=localhost
if not defined POSTGRES_DB set POSTGRES_DB=worklist_db
if not defined POSTGRES_USER set POSTGRES_USER=dicom
if not defined POSTGRES_PASSWORD set POSTGRES_PASSWORD=dicom123
if not defined POSTGRES_PORT set POSTGRES_PORT=5432

echo Environment Configuration:
echo   Host: %POSTGRES_HOST%
echo   Database: %POSTGRES_DB%
echo   User: %POSTGRES_USER%
echo   Port: %POSTGRES_PORT%
echo.
echo ================================================================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.7+ and try again
    pause
    exit /b 1
)

REM Check if psycopg2 is installed
python -c "import psycopg2" >nul 2>&1
if errorlevel 1 (
    echo WARNING: psycopg2-binary not found
    echo Installing required dependencies...
    pip install psycopg2-binary
    echo.
)

REM Run the seeder
echo Starting seeder...
echo.
python seed_doctors.py %1

REM Check exit code
if errorlevel 1 (
    echo.
    echo ================================================================================
    echo Seeding FAILED - Please check errors above
    echo ================================================================================
) else (
    echo.
    echo ================================================================================
    echo Seeding COMPLETED successfully!
    echo ================================================================================
)

echo.
pause
