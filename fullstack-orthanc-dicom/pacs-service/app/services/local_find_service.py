"""
Local Find Service
Handles querying the local database for DICOM studies and series
Implements the same interface as DicomFindService but for local DB
"""

import logging
from typing import List, Dict, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func, desc

from app.models.study import Study
from app.models.series import Series
from app.models.instance import Instance
from app.database import get_db

logger = logging.getLogger(__name__)


class LocalFindService:
    """Service for querying local DICOM database"""
    
    def __init__(self, db: Session):
        self.db = db
        
    def query_studies(
        self,
        patient_id: Optional[str] = None,
        patient_name: Optional[str] = None,
        study_date: Optional[str] = None,
        modality: Optional[str] = None,
        study_description: Optional[str] = None,
        accession_number: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict]:
        """
        Query studies from local database
        """
        query = self.db.query(Study)
        
        # Apply filters
        if patient_id:
            # Use ilike for case-insensitive partial match
            query = query.filter(Study.patient_id.ilike(f"%{patient_id}%"))
            
        if patient_name:
            # Handle caret separation in DICOM names if needed, but simple ilike for now
            query = query.filter(Study.patient_name.ilike(f"%{patient_name}%"))
            
        if study_date:
            # Handle date range (YYYYMMDD-YYYYMMDD) or single date
            if '-' in study_date:
                start_date, end_date = study_date.split('-')
                if start_date:
                    query = query.filter(Study.study_date >= datetime.strptime(start_date, "%Y%m%d").date())
                if end_date:
                    query = query.filter(Study.study_date <= datetime.strptime(end_date, "%Y%m%d").date())
            else:
                try:
                    date_obj = datetime.strptime(study_date, "%Y%m%d").date()
                    query = query.filter(Study.study_date == date_obj)
                except ValueError:
                    pass # Ignore invalid dates
                    
        if modality:
            query = query.filter(Study.modality.ilike(f"%{modality}%"))
            
        if study_description:
            query = query.filter(Study.study_description.ilike(f"%{study_description}%"))
            
        if accession_number:
            query = query.filter(Study.accession_number.ilike(f"%{accession_number}%"))
            
        # Sort by study date desc
        query = query.order_by(desc(Study.study_date))
        
        # Pagination
        total = query.count()
        studies = query.limit(limit).offset(offset).all()
        
        results = []
        for study in studies:
            # Calculate instance count (could be optimized with group by)
            # For now, simple count
            instance_count = 0
            series_count = len(study.series)
            for series in study.series:
                instance_count += len(series.instances)
                
            results.append({
                'study_instance_uid': study.study_instance_uid,
                'study_date': study.study_date.strftime("%Y%m%d") if study.study_date else '',
                'study_time': study.study_time.strftime("%H%M%S") if study.study_time else '',
                'study_description': study.study_description or '',
                'accession_number': study.accession_number or '',
                'patient_id': study.patient_id or '',
                'patient_name': study.patient_name or '',
                'patient_birth_date': study.patient_birth_date.strftime("%Y%m%d") if study.patient_birth_date else '',
                'patient_gender': study.patient_gender or '',
                'modality': study.modality or '',
                'number_of_series': series_count,
                'number_of_instances': instance_count,
            })
            
        return results

    def query_series(
        self,
        study_uid: str,
        modality: Optional[str] = None
    ) -> List[Dict]:
        """
        Query series for a study from local database
        """
        query = self.db.query(Series).filter(Series.study_instance_uid == study_uid)
        
        if modality:
            query = query.filter(Series.modality == modality)
            
        series_list = query.all()
        
        results = []
        for series in series_list:
            results.append({
                'series_instance_uid': series.series_instance_uid,
                'series_number': str(series.series_number) if series.series_number is not None else '',
                'series_description': series.series_description or '',
                'modality': series.modality or '',
                'series_date': '', # Not always available at series level in DB
                'series_time': '',
                'number_of_instances': len(series.instances),
            })
            
        return results
