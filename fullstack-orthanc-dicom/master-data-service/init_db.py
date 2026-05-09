#!/usr/bin/env python3
"""
Database initialization script for Master Data Service
Runs before the application starts to ensure all tables are created
"""
import os
import sys
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

# Import the init_database function from main
try:
    from main import init_database

    logger.info("=" * 80)
    logger.info("Initializing Master Data Service Database Schema")
    logger.info("=" * 80)

    # Call the initialization function
    init_database()

    logger.info("=" * 80)
    logger.info("Database initialization completed successfully")
    logger.info("=" * 80)

    sys.exit(0)

except Exception as e:
    logger.error("=" * 80)
    logger.error(f"Database initialization failed: {str(e)}")
    logger.error("=" * 80)
    import traceback
    traceback.print_exc()
    sys.exit(1)
