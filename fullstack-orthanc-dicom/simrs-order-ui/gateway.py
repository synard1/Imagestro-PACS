import os
from typing import Optional, Dict, Any
import httpx
from utils import get_logger

logger = get_logger("gateway")

# DEFAULT_GATEWAY_BASE = os.getenv("GATEWAY_BASE", "http://103.42.117.19:8888")
DEFAULT_GATEWAY_BASE = "http://103.42.117.19:8888"
TIMEOUT = httpx.Timeout(10.0, connect=5.0)


class GatewayClient:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or DEFAULT_GATEWAY_BASE).rstrip("/")

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    async def login(self, username: str, password: str) -> Dict[str, Any]:
        url = self._url("/auth/login")
        payload = {"username": username, "password": password}
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(url, json=payload)
            logger.info(f"POST {url} status={resp.status_code}")
            resp.raise_for_status()
            return resp.json()

    async def create_order(self, token: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = self._url("/orders/create")
        headers = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers=headers)
            logger.info(f"POST {url} status={resp.status_code}")
            resp.raise_for_status()
            return resp.json()

    async def complete_flow(self, token: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        url = self._url("/orders/complete-flow")
        headers = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(url, json=payload, headers=headers)
            logger.info(f"POST {url} status={resp.status_code}")
            resp.raise_for_status()
            return resp.json()

    async def get_order(self, token: str, identifier: str) -> Dict[str, Any]:
        url = self._url(f"/orders/{identifier}")
        headers = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
            logger.info(f"GET {url} status={resp.status_code}")
            resp.raise_for_status()
            return resp.json()

    async def create_service_request(self, token: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        # Fix: Use the correct endpoint path for service request creation
        url = self._url("/satusehat/servicerequest")
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        
        # Log the payload being sent
        logger.info(f"Sending service request payload: {payload}")
        
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.post(url, json=payload, headers=headers)
                logger.info(f"POST {url} status={resp.status_code}")
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Service request creation failed: {e.response.text}")
            raise
            raise