"""
DICOM C-FIND Service (Query)
Query remote PACS/modalities for patients, studies, series, instances
"""

import logging
from typing import List, Dict, Optional
from pynetdicom import AE, QueryRetrievePresentationContexts
from pynetdicom.sop_class import (
    PatientRootQueryRetrieveInformationModelFind,
    StudyRootQueryRetrieveInformationModelFind,
)
from pydicom.dataset import Dataset

logger = logging.getLogger(__name__)


class DicomFindService:
    """DICOM C-FIND Service for querying remote PACS"""
    
    def __init__(self, calling_ae_title: str = "PACS_SCU"):
        """
        Initialize C-FIND service
        
        Args:
            calling_ae_title: Our AE title
        """
        self.calling_ae_title = calling_ae_title
        self.ae = AE(ae_title=calling_ae_title)
        
        # Add presentation contexts for C-FIND
        self.ae.add_requested_context(PatientRootQueryRetrieveInformationModelFind)
        self.ae.add_requested_context(StudyRootQueryRetrieveInformationModelFind)
        
        logger.info(f"DICOM C-FIND service initialized: {calling_ae_title}")
    
    def query_studies(
        self,
        remote_ae: str,
        remote_host: str,
        remote_port: int,
        patient_id: Optional[str] = None,
        patient_name: Optional[str] = None,
        study_date: Optional[str] = None,
        modality: Optional[str] = None,
        study_description: Optional[str] = None,
        timeout: int = 30
    ) -> List[Dict]:
        """
        Query studies from remote PACS
        
        Args:
            remote_ae: Remote AE title
            remote_host: Remote host
            remote_port: Remote port
            patient_id: Patient ID filter
            patient_name: Patient name filter
            study_date: Study date filter (YYYYMMDD or range)
            modality: Modality filter
            study_description: Study description filter
            timeout: Query timeout
            
        Returns:
            List of study dictionaries
        """
        logger.info(f"Querying studies from {remote_ae} at {remote_host}:{remote_port}")
        
        try:
            # Create query dataset
            ds = Dataset()
            ds.QueryRetrieveLevel = 'STUDY'
            
            # Required return keys
            ds.StudyInstanceUID = ''
            ds.StudyDate = study_date or ''
            ds.StudyTime = ''
            ds.StudyDescription = study_description or ''
            ds.AccessionNumber = ''
            ds.PatientID = patient_id or ''
            ds.PatientName = patient_name or ''
            ds.PatientBirthDate = ''
            ds.PatientSex = ''
            ds.Modality = modality or ''
            ds.NumberOfStudyRelatedSeries = ''
            ds.NumberOfStudyRelatedInstances = ''
            
            # Associate with remote PACS
            assoc = self.ae.associate(
                remote_host,
                remote_port,
                ae_title=remote_ae,
                max_pdu=16384
            )
            
            if not assoc.is_established:
                logger.error(f"Failed to establish association with {remote_ae}")
                return []
            
            logger.info("Association established, sending C-FIND request")
            
            # Send C-FIND request
            responses = assoc.send_c_find(ds, StudyRootQueryRetrieveInformationModelFind)
            
            # Collect results
            results = []
            for (status, identifier) in responses:
                if status and status.Status in [0xFF00, 0xFF01]:  # Pending
                    if identifier:
                        study = {
                            'study_instance_uid': str(identifier.StudyInstanceUID) if hasattr(identifier, 'StudyInstanceUID') else '',
                            'study_date': str(identifier.StudyDate) if hasattr(identifier, 'StudyDate') else '',
                            'study_time': str(identifier.StudyTime) if hasattr(identifier, 'StudyTime') else '',
                            'study_description': str(identifier.StudyDescription) if hasattr(identifier, 'StudyDescription') else '',
                            'accession_number': str(identifier.AccessionNumber) if hasattr(identifier, 'AccessionNumber') else '',
                            'patient_id': str(identifier.PatientID) if hasattr(identifier, 'PatientID') else '',
                            'patient_name': str(identifier.PatientName) if hasattr(identifier, 'PatientName') else '',
                            'patient_birth_date': str(identifier.PatientBirthDate) if hasattr(identifier, 'PatientBirthDate') else '',
                            'patient_gender': str(identifier.PatientSex) if hasattr(identifier, 'PatientSex') else '',
                            'modality': str(identifier.Modality) if hasattr(identifier, 'Modality') else '',
                            'number_of_series': int(identifier.NumberOfStudyRelatedSeries) if hasattr(identifier, 'NumberOfStudyRelatedSeries') else 0,
                            'number_of_instances': int(identifier.NumberOfStudyRelatedInstances) if hasattr(identifier, 'NumberOfStudyRelatedInstances') else 0,
                        }
                        results.append(study)
                        logger.debug(f"Found study: {study['study_instance_uid']}")
            
            # Release association
            assoc.release()
            
            logger.info(f"Query complete: {len(results)} studies found")
            return results
            
        except Exception as e:
            logger.error(f"Error querying studies: {e}", exc_info=True)
            return []
    
    def query_series(
        self,
        remote_ae: str,
        remote_host: str,
        remote_port: int,
        study_uid: str,
        modality: Optional[str] = None,
        timeout: int = 30
    ) -> List[Dict]:
        """
        Query series for a study
        
        Args:
            remote_ae: Remote AE title
            remote_host: Remote host
            remote_port: Remote port
            study_uid: Study Instance UID
            modality: Modality filter
            timeout: Query timeout
            
        Returns:
            List of series dictionaries
        """
        logger.info(f"Querying series for study {study_uid}")
        
        try:
            # Create query dataset
            ds = Dataset()
            ds.QueryRetrieveLevel = 'SERIES'
            ds.StudyInstanceUID = study_uid
            
            # Required return keys
            ds.SeriesInstanceUID = ''
            ds.SeriesNumber = ''
            ds.SeriesDescription = ''
            ds.Modality = modality or ''
            ds.SeriesDate = ''
            ds.SeriesTime = ''
            ds.NumberOfSeriesRelatedInstances = ''
            
            # Associate
            assoc = self.ae.associate(
                remote_host,
                remote_port,
                ae_title=remote_ae,
                max_pdu=16384
            )
            
            if not assoc.is_established:
                logger.error(f"Failed to establish association")
                return []
            
            # Send C-FIND
            responses = assoc.send_c_find(ds, StudyRootQueryRetrieveInformationModelFind)
            
            # Collect results
            results = []
            for (status, identifier) in responses:
                if status and status.Status in [0xFF00, 0xFF01]:
                    if identifier:
                        series = {
                            'series_instance_uid': str(identifier.SeriesInstanceUID) if hasattr(identifier, 'SeriesInstanceUID') else '',
                            'series_number': str(identifier.SeriesNumber) if hasattr(identifier, 'SeriesNumber') else '',
                            'series_description': str(identifier.SeriesDescription) if hasattr(identifier, 'SeriesDescription') else '',
                            'modality': str(identifier.Modality) if hasattr(identifier, 'Modality') else '',
                            'series_date': str(identifier.SeriesDate) if hasattr(identifier, 'SeriesDate') else '',
                            'series_time': str(identifier.SeriesTime) if hasattr(identifier, 'SeriesTime') else '',
                            'number_of_instances': int(identifier.NumberOfSeriesRelatedInstances) if hasattr(identifier, 'NumberOfSeriesRelatedInstances') else 0,
                        }
                        results.append(series)
            
            assoc.release()
            
            logger.info(f"Query complete: {len(results)} series found")
            return results
            
        except Exception as e:
            logger.error(f"Error querying series: {e}", exc_info=True)
            return []


# Singleton instance
_find_service = None

def get_find_service() -> DicomFindService:
    """Get singleton C-FIND service instance"""
    global _find_service
    if _find_service is None:
        _find_service = DicomFindService()
    return _find_service
