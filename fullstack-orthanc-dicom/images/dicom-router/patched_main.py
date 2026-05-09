import os
import shutil
import time
import threading
import requests
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("DICOM-Router-Patched")

def clear_incoming_folder():
    folder = "/app/in"
    # Pastikan folder ada
    os.makedirs(folder, exist_ok=True)

    # Hapus hanya isi folder, bukan folder mount point
    for filename in os.listdir(folder):
        file_path = os.path.join(folder, filename)
        try:
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)
        except Exception as e:
            logger.error(f"Failed to delete {file_path}: {e}")

def monitor_and_submit():
    """
    Monitor successful transfers and trigger ImagingStudy submission.
    This is a simplified implementation that assumes the router moves processed
    files to a specific folder or logs them.
    """
    logger.info("Starting SATUSEHAT submission monitor...")
    # This is a placeholder for actual router-specific logic
    # In a real scenario, we would tail logs or watch a directory
    while True:
        try:
            # Check for success indicators
            # For now, we just sleep as the primary submission is triggered from pacs-service
            time.sleep(60)
        except Exception as e:
            logger.error(f"Monitor error: {e}")
            time.sleep(10)

if __name__ == "__main__":
    logger.info("I: [Init] - Clearing incoming folder safely")
    clear_incoming_folder()

    # Start background monitor
    monitor_thread = threading.Thread(target=monitor_and_submit, daemon=True)
    monitor_thread.start()

    # Lanjutkan ke logika asli aplikasi
    # Import modul utama dari aplikasi bawaan
    import runpy
    import sys
    logger.info(f"sys.path: {sys.path}")
    
    # Run the original main module
    try:
        runpy.run_module("main", run_name="__main__")
    except Exception as e:
        logger.critical(f"Original application failed: {e}")
        sys.exit(1)
