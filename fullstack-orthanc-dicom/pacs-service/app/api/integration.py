"""
Integration API Endpoints
Order management integration
"""

from fastapi import APIRouter, Depends
from app.middleware.rbac import require_permission

router = APIRouter(prefix="/api/integration", tags=["integration"])


@router.get("/orders/{order_id}/studies")
async def get_studies_for_order(order_id: str, current_user: dict = Depends(require_permission("study:view"))):
    """Get studies for an order - To be implemented"""
    return {"status": "success", "message": "Order integration - To be implemented", "data": []}
