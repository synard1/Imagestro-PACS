"""
DICOM SCP (Service Class Provider) - Receives DICOM images from modalities
Implements C-STORE and C-ECHO services with thread-safe session management
"""

import logging
import os
import tempfile
import asyncio
from pathlib import Path
from typing import Optional
from datetime import datetime

from pynetdicom import AE, evt, StoragePresentationContexts
from pynetdicom.sop_class import Verification
from pydicom import dcmread
from pydicom.dataset import Dataset

from app.services.dicom_storage_service_v2 import DicomStorageServiceV2
from app.database import get_db

logger = logging.getLogger(__name__)


class DicomSCP:
    """DICOM Storage SCP Service"""
    
    def __init__(
        self,
        ae_title: str = "PACS_SCP",
        port: int = 11112,
        storage_path: str = "./dicom-storage"
    ):
        self.ae_title = ae_title
        self.port = port
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        # Create Application Entity
        self.ae = AE(ae_title=ae_title)
        
        # Add supported presentation contexts
        # Support all storage SOP classes
        self.ae.supported_contexts = StoragePresentationContexts
        
        # Add Verification (C-ECHO) support
        self.ae.add_supported_context(Verification)
        
        # Statistics
        self.stats = {
            "total_received": 0,
            "total_stored": 0,
            "total_failed": 0,
            "last_received": None
        }
        
        logger.info(f"DICOM SCP initialized: {ae_title} on port {port}")
    
    def handle_store(self, event):
        """
        Handle C-STORE request (receive DICOM image)
        Executed in a separate thread for each association (pynetdicom default)
        
        Args:
            event: pynetdicom event containing the dataset
            
        Returns:
            int: Status code (0x0000 = success)
        """
        temp_path = None
        db_gen = None
        db = None
        
        try:
            # Get the dataset
            ds: Dataset = event.dataset
            
            # Get context information
            requestor = event.assoc.requestor
            
            logger.info(
                f"Receiving C-STORE from {requestor.ae_title} "
                f"[{requestor.address}:{requestor.port}]"
            )
            
            # Log DICOM tags
            patient_id = getattr(ds, 'PatientID', 'UNKNOWN')
            study_uid = getattr(ds, 'StudyInstanceUID', 'UNKNOWN')
            instance_uid = getattr(ds, 'SOPInstanceUID', 'UNKNOWN')
            
            logger.info(
                f"Patient: {patient_id}, "
                f"Study: {study_uid[:16]}..., "
                f"Instance: {instance_uid[:16]}..."
            )
            
            # Create a new database session for this thread
            # get_db is a generator, we need to manually manage it
            db_gen = get_db()
            db = next(db_gen)
            
            # Save DICOM to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.dcm') as temp_file:
                temp_path = temp_file.name
                ds.save_as(temp_path, write_like_original=False)
            
            # Store using DicomStorageServiceV2 (adapter-aware, S3/local)
            storage_service = DicomStorageServiceV2(db)
            
            # Handle asyncio loop for this thread
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
            
            result = loop.run_until_complete(storage_service.store_dicom(temp_path))
            
            if result:
                self.stats["total_received"] += 1
                self.stats["total_stored"] += 1
                self.stats["last_received"] = datetime.now()
                
                logger.info(
                    f"✓ Stored instance: {instance_uid[:16]}... "
                    f"(File ID: {result.id}, Patient: {result.patient_id})"
                )
                
                # Return success
                return 0x0000
            else:
                self.stats["total_failed"] += 1
                logger.error("Failed to store DICOM file (storage service returned None)")
                return 0xC000  # Error: Cannot understand
                
        except Exception as e:
            self.stats["total_failed"] += 1
            logger.error(f"Error handling C-STORE: {e}", exc_info=True)
            return 0xC000  # Error: Cannot understand
            
        finally:
            # Clean up temp file
            if temp_path and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception as cleanup_error:
                    logger.warning(f"Failed to cleanup temp file {temp_path}: {cleanup_error}")
            
            # Close database session properly
            if db_gen is not None:
                try:
                    next(db_gen, None)  # Should raise StopIteration
                except StopIteration:
                    pass
                except Exception as db_error:
                    logger.error(f"Error closing DB session: {db_error}")
    
    def handle_echo(self, event):
        """
        Handle C-ECHO request (connection test)
        
        Args:
            event: pynetdicom event
            
        Returns:
            int: Status code (0x0000 = success)
        """
        requestor = event.assoc.requestor
        logger.info(
            f"C-ECHO from {requestor.ae_title} "
            f"[{requestor.address}:{requestor.port}]"
        )
        return 0x0000
    
    def handle_association_requested(self, event):
        """Handle association request"""
        requestor = event.assoc.requestor
        logger.info(
            f"Association requested by {requestor.ae_title} "
            f"[{requestor.address}:{requestor.port}]"
        )
    
    def handle_association_accepted(self, event):
        """Handle association accepted"""
        requestor = event.assoc.requestor
        logger.info(
            f"Association accepted with {requestor.ae_title} "
            f"[{requestor.address}:{requestor.port}]"
        )
    
    def handle_association_released(self, event):
        """Handle association released"""
        logger.info("Association released")
    
    def handle_association_aborted(self, event):
        """Handle association aborted"""
        logger.warning("Association aborted")
    
    def start(self):
        """Start the DICOM SCP server"""
        
        # Set up event handlers
        handlers = [
            (evt.EVT_C_STORE, self.handle_store),
            (evt.EVT_C_ECHO, self.handle_echo),
            (evt.EVT_REQUESTED, self.handle_association_requested),
            (evt.EVT_ACCEPTED, self.handle_association_accepted),
            (evt.EVT_RELEASED, self.handle_association_released),
            (evt.EVT_ABORTED, self.handle_association_aborted),
        ]
        
        logger.info(f"Starting DICOM SCP: {self.ae_title} on port {self.port}")
        logger.info(f"Storage path: {self.storage_path.absolute()}")
        logger.info("Supported services: C-STORE, C-ECHO")
        logger.info("Concurrency: Threaded (pynetdicom default - one thread per association)")
        logger.info("Waiting for connections...")
        
        # Start listening (blocking)
        # pynetdicom uses ThreadedAssociationControl by default
        self.ae.start_server(
            ("0.0.0.0", self.port),
            evt_handlers=handlers,
            block=True
        )
    
    def get_stats(self) -> dict:
        """Get SCP statistics"""
        return {
            **self.stats,
            "ae_title": self.ae_title,
            "port": self.port,
            "storage_path": str(self.storage_path)
        }


def start_scp_daemon(
    ae_title: str = "PACS_SCP",
    port: int = 11112,
    storage_path: str = "./dicom-storage"
):
    """
    Start DICOM SCP daemon
    
    Args:
        ae_title: Application Entity title
        port: Port to listen on
        storage_path: Path to store DICOM files
    """
    scp = DicomSCP(ae_title=ae_title, port=port, storage_path=storage_path)
    scp.start()


if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Start SCP daemon
    start_scp_daemon()
