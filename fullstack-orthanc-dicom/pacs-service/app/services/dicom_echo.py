"""
DICOM C-ECHO Service - Test DICOM connections
"""

import logging
import time
from typing import Dict

from pynetdicom import AE
from pynetdicom.sop_class import Verification

logger = logging.getLogger(__name__)


def test_dicom_connection(
    ae_title: str,
    host: str,
    port: int,
    timeout: int = 30,
    calling_ae_title: str = "PACS_SCU"
) -> Dict:
    """
    Test DICOM connection using C-ECHO
    
    Args:
        ae_title: Remote AE title
        host: Remote host
        port: Remote port
        timeout: Connection timeout in seconds
        calling_ae_title: Our AE title
        
    Returns:
        dict: {
            "success": bool,
            "status": str,
            "message": str,
            "response_time_ms": float
        }
    """
    
    logger.info(f"Testing connection to {ae_title} at {host}:{port}")
    
    # Create Application Entity
    ae = AE(ae_title=calling_ae_title)
    ae.add_requested_context(Verification)
    
    start_time = time.time()
    
    try:
        # Attempt association
        assoc = ae.associate(
            addr=host,
            port=port,
            ae_title=ae_title,
            max_pdu=16384,
            ext_neg=None
        )
        
        if assoc.is_established:
            # Send C-ECHO
            status = assoc.send_c_echo()
            
            # Calculate response time
            response_time = (time.time() - start_time) * 1000
            
            # Release association
            assoc.release()
            
            if status and status.Status == 0x0000:
                logger.info(f"✓ C-ECHO successful to {ae_title} ({response_time:.1f}ms)")
                return {
                    "success": True,
                    "status": "online",
                    "message": f"Connection successful (response time: {response_time:.1f}ms)",
                    "response_time_ms": response_time
                }
            else:
                logger.warning(f"C-ECHO failed to {ae_title}: Status {status}")
                return {
                    "success": False,
                    "status": "error",
                    "message": f"C-ECHO failed with status: {status}",
                    "response_time_ms": None
                }
        else:
            logger.warning(f"Failed to establish association with {ae_title}")
            return {
                "success": False,
                "status": "offline",
                "message": "Failed to establish DICOM association",
                "response_time_ms": None
            }
            
    except ConnectionRefusedError:
        logger.error(f"Connection refused to {host}:{port}")
        return {
            "success": False,
            "status": "offline",
            "message": f"Connection refused to {host}:{port}",
            "response_time_ms": None
        }
    except TimeoutError:
        logger.error(f"Connection timeout to {host}:{port}")
        return {
            "success": False,
            "status": "timeout",
            "message": f"Connection timeout after {timeout}s",
            "response_time_ms": None
        }
    except Exception as e:
        logger.error(f"Error testing connection to {ae_title}: {e}", exc_info=True)
        return {
            "success": False,
            "status": "error",
            "message": f"Error: {str(e)}",
            "response_time_ms": None
        }


if __name__ == "__main__":
    # Test local SCP
    logging.basicConfig(level=logging.INFO)
    result = test_dicom_connection(
        ae_title="PACS_SCP",
        host="localhost",
        port=11112
    )
    print(result)
