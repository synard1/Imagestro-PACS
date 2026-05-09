"""
DICOM C-MOVE Service (Retrieve)
Retrieve images from remote PACS/modalities
"""

import logging
from typing import Dict, Optional
from pynetdicom import AE, QueryRetrievePresentationContexts, StoragePresentationContexts
from pynetdicom.sop_class import (
    StudyRootQueryRetrieveInformationModelMove,
    PatientRootQueryRetrieveInformationModelMove,
)
from pydicom.dataset import Dataset

logger = logging.getLogger(__name__)


class DicomMoveService:
    """DICOM C-MOVE Service for retrieving images"""
    
    def __init__(self, calling_ae_title: str = "PACS_SCU"):
        """
        Initialize C-MOVE service
        
        Args:
            calling_ae_title: Our AE title
        """
        self.calling_ae_title = calling_ae_title
        self.ae = AE(ae_title=calling_ae_title)
        
        # Add presentation contexts for C-MOVE
        self.ae.add_requested_context(StudyRootQueryRetrieveInformationModelMove)
        self.ae.add_requested_context(PatientRootQueryRetrieveInformationModelMove)
        
        logger.info(f"DICOM C-MOVE service initialized: {calling_ae_title}")
    
    def move_study(
        self,
        remote_ae: str,
        remote_host: str,
        remote_port: int,
        study_uid: str,
        destination_ae: str,
        timeout: int = 300
    ) -> Dict:
        """
        Retrieve study from remote PACS using C-MOVE
        
        Args:
            remote_ae: Remote AE title
            remote_host: Remote host
            remote_port: Remote port
            study_uid: Study Instance UID to retrieve
            destination_ae: Destination AE title (where to send images)
            timeout: Move timeout
            
        Returns:
            dict with status and statistics
        """
        logger.info(f"Moving study {study_uid} from {remote_ae} to {destination_ae}")
        
        try:
            # Create move dataset
            ds = Dataset()
            ds.QueryRetrieveLevel = 'STUDY'
            ds.StudyInstanceUID = study_uid
            
            # Associate with remote PACS
            assoc = self.ae.associate(
                remote_host,
                remote_port,
                ae_title=remote_ae,
                max_pdu=16384
            )
            
            if not assoc.is_established:
                logger.error(f"Failed to establish association with {remote_ae}")
                return {
                    "success": False,
                    "error": "Failed to establish association",
                    "completed": 0,
                    "failed": 0,
                    "warning": 0,
                    "remaining": 0
                }
            
            logger.info(f"Association established, sending C-MOVE to {destination_ae}")
            
            # Send C-MOVE request
            responses = assoc.send_c_move(
                ds,
                destination_ae,
                StudyRootQueryRetrieveInformationModelMove
            )
            
            # Track statistics
            completed = 0
            failed = 0
            warning = 0
            remaining = 0
            
            for (status, identifier) in responses:
                if status:
                    # Status codes:
                    # 0xFF00 = Pending (sub-operations continuing)
                    # 0x0000 = Success (all sub-operations complete)
                    # 0xXXXX = Failure/Warning
                    
                    if status.Status == 0xFF00:  # Pending
                        if hasattr(status, 'NumberOfCompletedSuboperations'):
                            completed = status.NumberOfCompletedSuboperations
                        if hasattr(status, 'NumberOfFailedSuboperations'):
                            failed = status.NumberOfFailedSuboperations
                        if hasattr(status, 'NumberOfWarningSuboperations'):
                            warning = status.NumberOfWarningSuboperations
                        if hasattr(status, 'NumberOfRemainingSuboperations'):
                            remaining = status.NumberOfRemainingSuboperations
                        
                        logger.debug(
                            f"C-MOVE progress: {completed} completed, "
                            f"{failed} failed, {remaining} remaining"
                        )
                    
                    elif status.Status == 0x0000:  # Success
                        logger.info("C-MOVE completed successfully")
                        if hasattr(status, 'NumberOfCompletedSuboperations'):
                            completed = status.NumberOfCompletedSuboperations
                        if hasattr(status, 'NumberOfFailedSuboperations'):
                            failed = status.NumberOfFailedSuboperations
                        if hasattr(status, 'NumberOfWarningSuboperations'):
                            warning = status.NumberOfWarningSuboperations
                    
                    else:  # Error
                        logger.error(f"C-MOVE failed with status: 0x{status.Status:04X}")
            
            # Release association
            assoc.release()
            
            result = {
                "success": failed == 0,
                "completed": completed,
                "failed": failed,
                "warning": warning,
                "remaining": remaining,
                "total": completed + failed + warning
            }
            
            logger.info(
                f"C-MOVE complete: {completed} succeeded, "
                f"{failed} failed, {warning} warnings"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Error during C-MOVE: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "completed": 0,
                "failed": 0,
                "warning": 0,
                "remaining": 0
            }
    
    def move_series(
        self,
        remote_ae: str,
        remote_host: str,
        remote_port: int,
        study_uid: str,
        series_uid: str,
        destination_ae: str,
        timeout: int = 300
    ) -> Dict:
        """
        Retrieve series from remote PACS using C-MOVE
        
        Args:
            remote_ae: Remote AE title
            remote_host: Remote host
            remote_port: Remote port
            study_uid: Study Instance UID
            series_uid: Series Instance UID to retrieve
            destination_ae: Destination AE title
            timeout: Move timeout
            
        Returns:
            dict with status and statistics
        """
        logger.info(f"Moving series {series_uid} from {remote_ae} to {destination_ae}")
        
        try:
            # Create move dataset
            ds = Dataset()
            ds.QueryRetrieveLevel = 'SERIES'
            ds.StudyInstanceUID = study_uid
            ds.SeriesInstanceUID = series_uid
            
            # Associate
            assoc = self.ae.associate(
                remote_host,
                remote_port,
                ae_title=remote_ae,
                max_pdu=16384
            )
            
            if not assoc.is_established:
                return {
                    "success": False,
                    "error": "Failed to establish association"
                }
            
            # Send C-MOVE
            responses = assoc.send_c_move(
                ds,
                destination_ae,
                StudyRootQueryRetrieveInformationModelMove
            )
            
            # Track statistics
            completed = 0
            failed = 0
            warning = 0
            
            for (status, identifier) in responses:
                if status:
                    if status.Status == 0x0000:
                        if hasattr(status, 'NumberOfCompletedSuboperations'):
                            completed = status.NumberOfCompletedSuboperations
                        if hasattr(status, 'NumberOfFailedSuboperations'):
                            failed = status.NumberOfFailedSuboperations
                        if hasattr(status, 'NumberOfWarningSuboperations'):
                            warning = status.NumberOfWarningSuboperations
            
            assoc.release()
            
            return {
                "success": failed == 0,
                "completed": completed,
                "failed": failed,
                "warning": warning,
                "total": completed + failed + warning
            }
            
        except Exception as e:
            logger.error(f"Error during C-MOVE: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e)
            }


# Singleton instance
_move_service = None

def get_move_service() -> DicomMoveService:
    """Get singleton C-MOVE service instance"""
    global _move_service
    if _move_service is None:
        _move_service = DicomMoveService()
    return _move_service
