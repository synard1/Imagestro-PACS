#!/usr/bin/env python3
"""
DICOM SCP Daemon - Standalone service for receiving DICOM images
Run this separately from the main FastAPI server

Usage:
    python dicom_scp_daemon.py
    python dicom_scp_daemon.py --port 11112 --ae-title PACS_SCP
"""

import sys
import os
import argparse
import logging
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from app.services.dicom_scp import start_scp_daemon


def main():
    parser = argparse.ArgumentParser(description="DICOM SCP Daemon")
    parser.add_argument(
        "--ae-title",
        default=os.getenv("DICOM_SCP_AE_TITLE", "PACS_SCP"),
        help="Application Entity Title (default: PACS_SCP)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("DICOM_SCP_PORT", "11112")),
        help="Port to listen on (default: 11112)"
    )
    parser.add_argument(
        "--storage-path",
        default=os.getenv("DICOM_STORAGE_PATH", "./dicom-storage"),
        help="Path to store DICOM files (default: ./dicom-storage)"
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level (default: INFO)"
    )
    
    args = parser.parse_args()
    
    # Configure logging
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler("dicom_scp.log")
        ]
    )
    
    logger = logging.getLogger(__name__)
    
    logger.info("=" * 60)
    logger.info("DICOM SCP Daemon Starting")
    logger.info("=" * 60)
    logger.info(f"AE Title: {args.ae_title}")
    logger.info(f"Port: {args.port}")
    logger.info(f"Storage Path: {args.storage_path}")
    logger.info(f"Log Level: {args.log_level}")
    logger.info("=" * 60)
    
    try:
        start_scp_daemon(
            ae_title=args.ae_title,
            port=args.port,
            storage_path=args.storage_path
        )
    except KeyboardInterrupt:
        logger.info("\nShutting down DICOM SCP daemon...")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
