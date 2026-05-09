from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List, Union
from app.database import get_db
from app.models.usage import UsageRecord, UsageAlert, BillingEvent
from app.models.subscription import Subscription
from app.schemas.usage import (
    UsageRecordCreate,
    UsageRecordResponse,
    UsageRecordListResponse,
    UsageAlertCreate,
    UsageAlertResponse,
    UsageAlertListResponse,
    UsageSummary,
    UsageTrend,
    UsageAnalytics,
    BillingEventCreate,
    BillingEventResponse,
    BillingEventListResponse,
)
from app.middleware.auth import get_current_user
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/usage", tags=["usage"])


@router.get("/tenant/{tenant_id}/daily", response_model=UsageRecordListResponse)
async def get_daily_usage(
    tenant_id: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = Query(30, le=365),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = db.query(UsageRecord).filter(UsageRecord.tenant_id == tenant_id)

    if start_date:
        query = query.filter(UsageRecord.date >= start_date)
    if end_date:
        query = query.filter(UsageRecord.date <= end_date)

    records = query.order_by(UsageRecord.date.desc()).limit(limit).all()
    return {"items": records, "total": len(records)}


@router.get("/tenant/{tenant_id}/monthly", response_model=UsageRecordListResponse)
async def get_monthly_usage(
    tenant_id: str,
    months: int = Query(12, le=24),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0) - timedelta(
        days=months * 30
    )

    records = (
        db.query(UsageRecord)
        .filter(
            UsageRecord.tenant_id == tenant_id,
            UsageRecord.period == "monthly",
            UsageRecord.date >= start,
        )
        .order_by(UsageRecord.date.desc())
        .all()
    )

    if not records:
        records = (
            db.query(UsageRecord)
            .filter(UsageRecord.tenant_id == tenant_id)
            .order_by(UsageRecord.date.desc())
            .limit(months)
            .all()
        )

    return {"items": records, "total": len(records)}


@router.get("/tenant/{tenant_id}/summary", response_model=UsageSummary)
async def get_usage_summary(
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    sub = (
        db.query(Subscription)
        .filter(Subscription.tenant_id == tenant_id, Subscription.status == "active")
        .first()
    )

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    usage = (
        db.query(UsageRecord)
        .filter(UsageRecord.tenant_id == tenant_id, UsageRecord.date >= today)
        .first()
    )

    storage_gb = (
        (usage.storage_bytes / (1024**3)) if usage and usage.storage_bytes else 0.0
    )

    response = UsageSummary(
        tenant_id=tenant_id,
        tier_name=sub.product.name if sub else "Free",
        api_calls_today=usage.api_calls if usage else 0,
        api_limit=sub.product.max_api_calls_per_day if sub else None,
        storage_bytes=usage.storage_bytes if usage else 0,
        storage_gb=round(storage_gb, 2),
        storage_limit_gb=sub.product.max_storage_gb if sub else None,
        active_users=usage.active_users if usage else 0,
        user_limit=sub.product.max_users if sub else None,
        status=sub.status if sub else "active",
    )

    if response.api_limit and response.api_limit > 0:
        response.api_percent = round(
            response.api_calls_today / response.api_limit * 100, 1
        )
    if response.storage_limit_gb and response.storage_limit_gb > 0:
        response.storage_percent = round(
            storage_gb / response.storage_limit_gb * 100, 1
        )
    if response.user_limit and response.user_limit > 0:
        response.user_percent = round(
            response.active_users / response.user_limit * 100, 1
        )

    response.is_over_limit = (
        (response.api_percent > 100)
        or (response.storage_percent > 100)
        or (response.user_percent > 100)
    )

    return response


@router.get("/tenant/{tenant_id}/analytics", response_model=UsageAnalytics)
async def get_usage_analytics(
    tenant_id: str,
    period_start: Optional[str] = Query(None), # Changed to str to handle '30' or ISO date
    period_end: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    # Parsing logic for flexible period_start
    p_end = datetime.utcnow()
    if period_end:
        try:
            p_end = datetime.fromisoformat(period_end.replace('Z', '+00:00'))
        except ValueError:
            pass

    p_start = p_end - timedelta(days=30)
    if period_start:
        try:
            if period_start.isdigit():
                p_start = p_end - timedelta(days=int(period_start))
            else:
                p_start = datetime.fromisoformat(period_start.replace('Z', '+00:00'))
        except ValueError:
            pass
    
    # ENSURE NAIVE
    p_end = p_end.replace(tzinfo=None) if p_end.tzinfo else p_end
    p_start = p_start.replace(tzinfo=None) if p_start.tzinfo else p_start

    logger.info(f"Analytics request processed: start={p_start}, end={p_end}")

    sub = (
        db.query(Subscription)
        .filter(Subscription.tenant_id == tenant_id, Subscription.status == "active")
        .first()
    )

    records = (
        db.query(UsageRecord)
        .filter(
            UsageRecord.tenant_id == tenant_id,
            UsageRecord.date >= p_start,
            UsageRecord.date <= p_end,
        )
        .order_by(UsageRecord.date.asc())
        .all()
    )

    total_api = sum(r.api_calls for r in records)
    total_storage = max(r.storage_bytes for r in records) if records else 0
    peak_users = max(r.active_users for r in records) if records else 0

    api_trend = [
        UsageTrend(
            date=r.date.strftime("%Y-%m-%d"),
            api_calls=r.api_calls,
            storage_bytes=r.storage_bytes,
            active_users=r.active_users,
        )
        for r in records
    ]

    delta = p_end - p_start
    prev_start = p_start - delta
    
    prev_records = (
        db.query(UsageRecord)
        .filter(
            UsageRecord.tenant_id == tenant_id,
            UsageRecord.date >= prev_start,
            UsageRecord.date < p_start,
        )
        .all()
    )
    prev_api = sum(r.api_calls for r in prev_records)

    change = 0.0
    if prev_api > 0:
        change = round((total_api - prev_api) / prev_api * 100, 1)

    days = max(1, delta.days)

    return UsageAnalytics(
        tenant_id=tenant_id,
        period_start=p_start,
        period_end=p_end,
        total_api_calls=total_api,
        avg_api_calls_per_day=round(total_api / days, 1),
        total_storage_bytes=total_storage,
        peak_storage_bytes=total_storage,
        avg_active_users=round(peak_users / max(1, days), 1),
        peak_users=peak_users,
        api_trend=api_trend,
        previous_period_total_api_calls=prev_api,
        period_over_period_change=change,
    )


@router.get("/tenant/{tenant_id}/dlm-insights")
async def get_dlm_insights(
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from app.models.study import Study
    from sqlalchemy import func
    from datetime import datetime, timedelta

    if not validate_uuid(tenant_id):
        raise HTTPException(404, "Invalid tenant ID format")

    now = datetime.utcnow()
    thirty_days_ago = now - timedelta(days=30)
    six_months_ago = now - timedelta(days=180)

    # 1. Total studies for tenant
    total_studies = db.query(Study).filter(
        Study.tenant_id == tenant_id,
        Study.deleted_at.is_(None)
    ).count()

    if total_studies == 0:
        return {
            "tenant_id": tenant_id,
            "total_studies": 0,
            "hot_percent": 0,
            "warm_percent": 0,
            "cold_percent": 0,
            "stale_count": 0,
            "recommendation": "No data available."
        }

    # 2. Hot (accessed < 30 days ago)
    hot_count = db.query(Study).filter(
        Study.tenant_id == tenant_id,
        Study.deleted_at.is_(None),
        Study.last_accessed_at >= thirty_days_ago
    ).count()

    # 3. Warm (accessed between 30 days and 6 months ago)
    warm_count = db.query(Study).filter(
        Study.tenant_id == tenant_id,
        Study.deleted_at.is_(None),
        Study.last_accessed_at < thirty_days_ago,
        Study.last_accessed_at >= six_months_ago
    ).count()

    # 4. Cold (accessed > 6 months ago) -> Candidates for Archive
    cold_count = db.query(Study).filter(
        Study.tenant_id == tenant_id,
        Study.deleted_at.is_(None),
        Study.last_accessed_at < six_months_ago
    ).count()

    # Calculate actual storage bytes based on stale vs active to give cost estimation
    stale_bytes = db.query(func.coalesce(func.sum(Study.storage_size), 0)).filter(
        Study.tenant_id == tenant_id,
        Study.deleted_at.is_(None),
        Study.last_accessed_at < six_months_ago
    ).scalar()

    stale_gb = stale_bytes / (1024**3)
    est_savings = stale_gb * 0.015 # Assuming $0.015/GB difference between Hot and Glacier

    return {
        "tenant_id": tenant_id,
        "total_studies": total_studies,
        "hot_count": hot_count,
        "warm_count": warm_count,
        "cold_count": cold_count,
        "hot_percent": round((hot_count / total_studies) * 100, 1),
        "warm_percent": round((warm_count / total_studies) * 100, 1),
        "cold_percent": round((cold_count / total_studies) * 100, 1),
        "stale_gb": round(stale_gb, 2),
        "estimated_savings_usd": round(est_savings, 2),
        "recommendation": f"{cold_count} studies are inactive (>6 months). Archiving them could save approximately ${round(est_savings, 2)}/month." if cold_count > 0 else "Storage is highly optimized. No immediate archiving needed."
    }

@router.get("/alerts", response_model=UsageAlertListResponse)
async def list_alerts(
    tenant_id: Optional[str] = None,
    is_triggered: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = db.query(UsageAlert)

    if tenant_id:
        query = query.filter(UsageAlert.tenant_id == tenant_id)
    if is_triggered is not None:
        query = query.filter(UsageAlert.is_triggered == is_triggered)

    alerts = query.order_by(UsageAlert.created_at.desc()).all()
    return {"items": alerts, "total": len(alerts)}


@router.post("/alerts", response_model=UsageAlertResponse)
async def create_alert(
    alert: UsageAlertCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Only superadmin can manage alerts")

    db_alert = UsageAlert(**alert.model_dump())
    db.add(db_alert)
    db.commit()
    db.refresh(db_alert)
    return db_alert


@router.put("/alerts/{id}", response_model=UsageAlertResponse)
async def update_alert(
    id: str,
    is_enabled: bool,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Only superadmin can manage alerts")

    db_alert = db.query(UsageAlert).filter(UsageAlert.id == id).first()
    if not db_alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    db_alert.is_enabled = is_enabled
    db.commit()
    db.refresh(db_alert)
    return db_alert


@router.get("/billing-events", response_model=BillingEventListResponse)
async def list_billing_events(
    tenant_id: Optional[str] = None,
    is_delivered: Optional[bool] = None,
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPERADMIN":
        if tenant_id and current_user.get("tenant_id") != tenant_id:
            raise HTTPException(status_code=403, detail="Access denied")
        tenant_id = current_user.get("tenant_id")

    query = db.query(BillingEvent)
    if tenant_id:
        query = query.filter(BillingEvent.tenant_id == tenant_id)
    if is_delivered is not None:
        query = query.filter(BillingEvent.is_delivered == is_delivered)

    events = query.order_by(BillingEvent.created_at.desc()).limit(limit).all()
    return {"items": events, "total": len(events)}


@router.post("/billing-events", response_model=BillingEventResponse)
async def create_billing_event(
    event: BillingEventCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(
            status_code=403, detail="Only superadmin can create billing events"
        )

    db_event = BillingEvent(**event.model_dump())
    db.add(db_event)
    db.commit()
    db.refresh(db_event)
    return db_event


@router.post("/record")
async def record_usage(
    tenant_id: str,
    api_calls: int = 0,
    storage_bytes: int = 0,
    active_users: int = 0,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    sub = (
        db.query(Subscription)
        .filter(Subscription.tenant_id == tenant_id, Subscription.status == "active")
        .first()
    )

    usage = (
        db.query(UsageRecord)
        .filter(UsageRecord.tenant_id == tenant_id, UsageRecord.date >= today)
        .first()
    )

    if not usage:
        usage = UsageRecord(tenant_id=tenant_id, date=today, period="daily")
        db.add(usage)

    usage.api_calls = (usage.api_calls or 0) + api_calls
    usage.storage_bytes = max(usage.storage_bytes or 0, storage_bytes)
    usage.active_users = max(usage.active_users or 0, active_users)

    if sub:
        usage.api_calls_limit = sub.product.max_api_calls_per_day
        usage.storage_bytes_limit = (sub.product.max_storage_gb or 0) * (1024**3)
        usage.user_limit = sub.product.max_users

    db.commit()
    return {"status": "success", "api_calls": usage.api_calls}
