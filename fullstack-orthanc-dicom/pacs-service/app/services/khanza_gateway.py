import httpx
from typing import Optional, Any
from app.repositories.khanza_repo import KhanzaRepository
from app.utils.logger import get_logger

logger = get_logger(__name__)

class KhanzaGateway:
    def __init__(self, repo: KhanzaRepository):
        self.repo = repo

    async def _get_client(self) -> Optional[httpx.AsyncClient]:
        config = self.repo.get_config()
        if not config:
            return None
        return httpx.AsyncClient(base_url=config.base_url, headers={"X-API-Key": config.api_key}, timeout=config.timeout_ms/1000.0)

    async def check_health(self) -> bool:
        client = await self._get_client()
        if not client:
            return False
        try:
            async with client:
                response = await client.get("/health")
                return response.status_code == 200
        except Exception as e:
            logger.error(f"Khanza health check failed: {e}")
            return False

    async def request(self, method: str, path: str, data: Any = None) -> Any:
        client = await self._get_client()
        if not client:
            raise Exception("Khanza connection not configured")
        async with client:
            response = await client.request(method, path, json=data)
            response.raise_for_status()
            return response.json()
