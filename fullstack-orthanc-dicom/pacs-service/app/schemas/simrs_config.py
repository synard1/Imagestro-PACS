from pydantic import BaseModel, Field
from typing import Optional

class SIMRSConfig(BaseModel):
    adapter_type: str = Field(..., description="Type of SIMRS (e.g., khanza, universal)")
    adapter_url: str = Field(..., description="Base URL of the SIMRS adapter service")
    api_key: str = Field(..., description="API Key for the SIMRS adapter")
    jwt_token: Optional[str] = None
