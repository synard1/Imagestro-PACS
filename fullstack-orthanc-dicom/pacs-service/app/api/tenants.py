from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.tenant import Tenant, TenantInvitation
from app.models.subscription import Subscription, Product
from app.models.usage import UsageRecord
from app.models.study import Study
from sqlalchemy import func, text
from app.schemas.tenant import (
    TenantCreate,
    TenantUpdate,
    TenantResponse,
    TenantListResponse,
    TenantWithSubscription,
    UsageSummary,
    InvitationCreate,
    InvitationResponse,
)
from app.schemas.subscription import SubscriptionResponse
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_permission
from app.schemas.simrs_config import SIMRSConfig
import uuid
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/tenants", tags=["tenants"])


from fastapi import APIRouter, Depends, HTTPException, Query
import httpx
import time
from sqlalchemy.orm import Session
# ... (existing imports)

@router.get("/{tenant_id}/simrs-health")
async def check_tenant_simrs_health(
    tenant_id: str,
    current_user: dict = Depends(require_permission("system:admin")),
    db: Session = Depends(get_db)
):
    # Hanya Superadmin atau Tenant itu sendiri
    if current_user["role"] != "SUPERADMIN" and current_user.get("tenant_id") != tenant_id:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
        
    simrs_config = tenant.settings.get("simrs_config") if tenant.settings else None
    if not simrs_config:
        return {"status": "disabled", "latency": 0}

    # Ping ke adapter
    start = time.time()
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{simrs_config['adapter_url']}/health")
            latency = round((time.time() - start) * 1000)
            return {"status": "online" if resp.status_code == 200 else "error", "latency": latency}
    except:
        return {"status": "offline", "latency": 0}

@router.get("", response_model=TenantListResponse)
async def list_tenants(
    search: Optional[str] = None,
    type: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_verified: Optional[bool] = None,
    include_inactive: bool = False,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("system:admin")),
):
    query = db.query(Tenant)

    if search:
        query = query.filter(
            (Tenant.name.ilike(f"%{search}%"))
            | (Tenant.code.ilike(f"%{search}%"))
            | (Tenant.email.ilike(f"%{search}%"))
        )
    if type:
        query = query.filter(Tenant.type == type)
    if is_active is not None:
        query = query.filter(Tenant.is_active == is_active)
    if is_verified is not None:
        query = query.filter(Tenant.is_verified == is_verified)
    if not include_inactive:
        query = query.filter(Tenant.is_active == True)

    total = query.count()
    tenants = query.offset((page - 1) * limit).limit(limit).all()

    # Get aggregated stats for these tenants
    tenant_ids = [t.id for t in tenants]
    
    # Study stats from pacs_studies table
    study_stats = db.query(
        Study.tenant_id,
        func.count(Study.study_instance_uid).label("study_count"),
        func.sum(Study.storage_size).label("total_size")
    ).filter(Study.tenant_id.in_(tenant_ids)).group_by(Study.tenant_id).all()
    
    study_map = {str(s.tenant_id): {"count": s.study_count, "size": s.total_size or 0} for s in study_stats}

    # Registered User stats (direct count from users table)
    # Using raw SQL since pacs-service doesn't have a User model
    user_map = {}
    try:
        # Map tenant IDs to strings explicitly to ensure match
        str_tenant_ids = [str(tid) for tid in tenant_ids]
        
        if str_tenant_ids:
            # PostgreSQL specific 'ANY' syntax for lists
            result = db.execute(text("""
                SELECT tenant_id, count(1) as user_count 
                FROM users 
                WHERE tenant_id IS NOT NULL AND tenant_id::text = ANY(:t_ids)
                GROUP BY tenant_id
            """), {"t_ids": str_tenant_ids}).all()
            
            user_map = {str(row[0]): row[1] for row in result}
            print(f"[TenantAPI] User statistics mapped: {user_map}")
    except Exception as e:
        print(f"[TenantAPI] Error fetching user counts from users table: {e}")
        # Fallback to UsageRecord if users table query fails
        user_stats = db.query(
            UsageRecord.tenant_id,
            UsageRecord.active_users
        ).filter(
            UsageRecord.tenant_id.in_(tenant_ids),
            UsageRecord.period == "daily"
        ).order_by(UsageRecord.tenant_id, UsageRecord.date.desc()).distinct(UsageRecord.tenant_id).all()
        user_map = {str(u.tenant_id): u.active_users for u in user_stats}

    result_items = []
    for tenant in tenants:
        t_id_str = str(tenant.id)
        s_data = study_map.get(t_id_str, {"count": 0, "size": 0})
        
        # Build response dict
        item_dict = {}
        for key in dir(tenant):
            if not key.startswith("_") and not callable(getattr(tenant, key)):
                try:
                    val = getattr(tenant, key)
                    if hasattr(val, "__class__") and val.__class__.__name__ == "UUID":
                        val = str(val)
                    item_dict[key] = val
                except:
                    pass
        
        # Add statistics
        item_dict["study_count"] = s_data["count"]
        item_dict["storage_used_gb"] = round(s_data["size"] / (1024**3), 2)
        item_dict["user_count"] = user_map.get(t_id_str, 0)
        
        result_items.append(item_dict)

    return {"items": result_items, "total": total}


@router.post("", response_model=TenantResponse)
async def create_tenant(
    tenant: TenantCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("system:admin")),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(
            status_code=403, detail="Only superadmin can create tenants"
        )

    existing = db.query(Tenant).filter(Tenant.code == tenant.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tenant code already exists")

    db_tenant = Tenant(**tenant.model_dump())
    db.add(db_tenant)
    db.commit()
    db.refresh(db_tenant)
    return db_tenant


@router.get("/{id}", response_model=TenantResponse)
async def get_tenant(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("system:admin")),
):
    tenant = db.query(Tenant).filter(Tenant.id == id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.put("/{id}", response_model=TenantResponse)
async def update_tenant(
    id: str,
    tenant: TenantUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("system:admin")),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(
            status_code=403, detail="Only superadmin can update tenants"
        )

    db_tenant = db.query(Tenant).filter(Tenant.id == id).first()
    if not db_tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    for key, value in tenant.model_dump(exclude_unset=True).items():
        setattr(db_tenant, key, value)

    db.commit()
    db.refresh(db_tenant)
    return db_tenant


@router.delete("/{id}")
async def delete_tenant(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("system:admin")),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(
            status_code=403, detail="Only superadmin can delete tenants"
        )

    db_tenant = db.query(Tenant).filter(Tenant.id == id).first()
    if not db_tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    db_tenant.is_active = False
    db.commit()
    return {"status": "success", "message": "Tenant deactivated"}


@router.post("/{id}/verify")
async def verify_tenant(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("system:admin")),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(
            status_code=403, detail="Only superadmin can verify tenants"
        )

    db_tenant = db.query(Tenant).filter(Tenant.id == id).first()
    if not db_tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    db_tenant.is_verified = True
    db_tenant.verification_at = datetime.utcnow()
    db.commit()
    return {"status": "success", "message": "Tenant verified"}


@router.get("/{id}/subscription", response_model=SubscriptionResponse)
async def get_tenant_subscription(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("system:admin")),
):
    tenant = db.query(Tenant).filter(Tenant.id == id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    sub = (
        db.query(Subscription)
        .filter(Subscription.tenant_id == id, Subscription.status == "active")
        .first()
    )

    if sub:
        return sub
    return None


@router.get("/{id}/usage", response_model=UsageSummary)
async def get_tenant_usage(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("system:admin")),
):
    tenant = db.query(Tenant).filter(Tenant.id == id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    sub = (
        db.query(Subscription)
        .filter(Subscription.tenant_id == id, Subscription.status == "active")
        .first()
    )

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    usage = (
        db.query(UsageRecord)
        .filter(UsageRecord.tenant_id == id, UsageRecord.date >= today)
        .first()
    )

    storage_gb = (
        (usage.storage_bytes / (1024**3)) if usage and usage.storage_bytes else 0.0
    )

    response = UsageSummary(
        tenant_id=id,
        tier_name=sub.product.name if sub else "Free",
        api_calls_today=usage.api_calls if usage else 0,
        api_limit=sub.product.max_api_calls_per_day if sub else None,
        api_percent=0.0,
        storage_bytes=usage.storage_bytes if usage else 0,
        storage_gb=round(storage_gb, 2),
        storage_limit_gb=sub.product.max_storage_gb if sub else None,
        storage_percent=0.0,
        active_users=usage.active_users if usage else 0,
        user_limit=sub.product.max_users if sub else None,
        user_percent=0.0,
        status=sub.status if sub else "active",
    )

    if response.api_limit:
        response.api_percent = round(
            response.api_calls_today / response.api_limit * 100, 1
        )
    if response.storage_limit_gb:
        response.storage_percent = round(
            storage_gb / response.storage_limit_gb * 100, 1
        )
    if response.user_limit:
        response.user_percent = round(
            response.active_users / response.user_limit * 100, 1
        )

    response.is_over_limit = (
        (response.api_percent > 100)
        or (response.storage_percent > 100)
        or (response.user_percent > 100)
    )

    return response


@router.post("/{id}/invitation", response_model=InvitationResponse)
async def create_invitation(
    id: str,
    invitation: InvitationCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("system:admin")),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(
            status_code=403, detail="Only superadmin can create invitations"
        )

    tenant = db.query(Tenant).filter(Tenant.id == id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    token = str(uuid.uuid4())
    expires = datetime.utcnow() + timedelta(days=7)

    db_invitation = TenantInvitation(
        tenant_id=id,
        email=invitation.email,
        role=invitation.role,
        token=token,
        expires_at=expires,
    )
    db.add(db_invitation)
    db.commit()
    db.refresh(db_invitation)
    return db_invitation


@router.get("/invitation/{token}/accept")
async def accept_invitation(
    token: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("system:admin")),
):
    invitation = (
        db.query(TenantInvitation)
        .filter(TenantInvitation.token == token, TenantInvitation.is_used == False)
        .first()
    )

    if not invitation:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")

    if invitation.expires_at and invitation.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invitation expired")

    invitation.is_used = True
    invitation.used_at = datetime.utcnow()
    db.commit()

    tenant = db.query(Tenant).filter(Tenant.id == invitation.tenant_id).first()
    return {"status": "success", "tenant_id": tenant.id, "tenant_name": tenant.name}
