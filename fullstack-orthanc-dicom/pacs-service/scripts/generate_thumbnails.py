#!/usr/bin/env python3
"""
Pre-generate thumbnails for all active studies in the database.
"""
import os
import sys
import asyncio
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add app directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, get_db
from app.models.study import Study
from app.models.series import Series
from app.models.instance import Instance
from app.services.wado_service_v2 import get_wado_service_v2

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("thumbnail_generator")

async def generate_all_thumbnails(size=200):
    """Loop through all studies and generate thumbnails for the first instance"""
    db = SessionLocal()
    try:
        wado_v2 = get_wado_service_v2(db)
        
        # Get all active studies
        studies = db.query(Study).filter(Study.deleted_at.is_(None)).all()
        logger.info(f"Found {len(studies)} active studies to process")
        
        success_count = 0
        fail_count = 0
        skipped_count = 0
        
        for study in studies:
            try:
                # Get first series
                series = db.query(Series).filter(
                    Series.study_instance_uid == study.study_instance_uid
                ).order_by(Series.series_number.asc()).first()
                
                if not series:
                    logger.warning(f"No series found for study {study.study_instance_uid}")
                    skipped_count += 1
                    continue
                
                # Get first instance
                instance = db.query(Instance).filter(
                    Instance.series_instance_uid == series.series_instance_uid
                ).order_by(Instance.instance_number.asc()).first()
                
                if not instance:
                    logger.warning(f"No instance found for series {series.series_instance_uid}")
                    skipped_count += 1
                    continue
                
                # Generate thumbnail (will cache to disk automatically)
                logger.info(f"Processing thumbnail for study: {study.patient_name} ({study.study_instance_uid})")
                thumb = await wado_v2.get_thumbnail(
                    study.study_instance_uid,
                    series.series_instance_uid,
                    instance.sop_instance_uid,
                    size
                )
                
                if thumb:
                    success_count += 1
                else:
                    logger.error(f"Failed to generate thumbnail for {study.study_instance_uid}")
                    fail_count += 1
                    
            except Exception as e:
                logger.error(f"Error processing study {study.study_instance_uid}: {str(e)}")
                fail_count += 1
                
        logger.info("================================================================")
        logger.info(f"Thumbnail Generation Complete")
        logger.info(f"Total processed: {len(studies)}")
        logger.info(f"Success: {success_count}")
        logger.info(f"Failed: {fail_count}")
        logger.info(f"Skipped: {skipped_count}")
        logger.info("================================================================")
        
    finally:
        db.close()

if __name__ == "__main__":
    # Get size from args if provided
    thumb_size = 200
    if len(sys.argv) > 1:
        try:
            thumb_size = int(sys.argv[1])
        except ValueError:
            pass
            
    asyncio.run(generate_all_thumbnails(thumb_size))
