import os
import logging
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models.unified_integration import ExternalSystem
from app.utils.crypto import decrypt_value

logger = logging.getLogger(__name__)

def get_khanza_bridge_config(db: Session, tenant_id: str) -> Dict[str, Any]:
    system = db.query(ExternalSystem).filter(
        ExternalSystem.tenant_id == tenant_id,
        ExternalSystem.provider == 'khanza',
        ExternalSystem.is_active == True
    ).first()

    api_key = os.getenv("KHANZA_API_KEY", "l4nh5eVYrLAER")
    headers = {"X-API-Key": api_key, "Content-Type": "application/json"}

    if system:
        logger.info(f"MATCH FOUND for hospital: {tenant_id}")
        base_url = system.base_url or os.getenv("KHANZA_API_URL", "http://khanza-api:3000")
        if system.db_host: headers["X-SIMRS-DB-HOST"] = system.db_host
        if system.db_name: headers["X-SIMRS-DB-NAME"] = system.db_name
        if system.db_user: headers["X-SIMRS-DB-USER"] = system.db_user
        if system.db_password:
            # SENSITIVE: Attempt decrypt only if key exists
            if os.getenv("PACS_ENCRYPTION_KEY"):
                try:
                    headers["X-SIMRS-DB-PASS"] = decrypt_value(system.db_password)
                except:
                    headers["X-SIMRS-DB-PASS"] = system.db_password
            else:
                headers["X-SIMRS-DB-PASS"] = system.db_password
        if system.db_port: headers["X-SIMRS-DB-PORT"] = str(system.db_port)
        return {"base_url": base_url, "headers": headers}
    
    return {"base_url": os.getenv("KHANZA_API_URL", "http://khanza-api:3000"), "headers": headers}
