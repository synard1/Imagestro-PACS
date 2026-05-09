from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.subscription import Product, Subscription
from app.models.tenant import Tenant
from app.schemas.subscription import (
    ProductCreate,
    ProductUpdate,
    ProductResponse,
    ProductListResponse,
    SubscriptionCreate,
    SubscriptionUpdate,
    SubscriptionResponse,
    SubscriptionListResponse,
    SubscriptionWithDetails,
    UsageResponse,
)
from app.middleware.auth import get_current_user
import uuid
from datetime import datetime

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


@router.post("/seed-products", status_code=201)
async def seed_products(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Only superadmin can seed products")

    products_to_seed = [
        {
            "name": "Free Trial",
            "code": "free-tier",
            "tier": "free",
            "description": "Ideal for testing and small clinics",
            "price": 0,
            "currency": "IDR",
            "billing_cycle": "monthly",
            "max_users": 5,
            "max_storage_gb": 10,
            "max_api_calls_per_day": 1000,
            "features": ["basic_mwl", "basic_orders", "5_users"],
            "spec": {"uptime": "99.0%", "support": "community", "setup_fee": 0},
            "color": "#64748b",
            "is_featured": False,
            "sort_order": 1,
        },
        {
            "name": "Basic PACS",
            "code": "basic-tier",
            "tier": "basic",
            "description": "Standard features for growing centers",
            "price": 1500000,
            "currency": "IDR",
            "billing_cycle": "monthly",
            "max_users": 10,
            "max_storage_gb": 50,
            "max_api_calls_per_day": 5000,
            "features": [
                "full_mwl",
                "full_orders",
                "dicom_viewer",
                "10_users",
                "email_support",
            ],
            "spec": {"uptime": "99.5%", "support": "email", "setup_fee": 500000},
            "color": "#3b82f6",
            "is_featured": False,
            "sort_order": 2,
        },
        {
            "name": "Professional",
            "code": "pro-tier",
            "tier": "professional",
            "description": "Advanced analytics and full integration",
            "price": 3500000,
            "currency": "IDR",
            "billing_cycle": "monthly",
            "max_users": 25,
            "max_storage_gb": 200,
            "max_api_calls_per_day": 20000,
            "features": [
                "full_mwl",
                "full_orders",
                "dicom_viewer",
                "advanced_reports",
                "satusehat_integration",
                "api_access",
                "25_users",
                "priority_support",
            ],
            "spec": {
                "uptime": "99.9%",
                "support": "24/7 Priority",
                "setup_fee": 1000000,
                "api_access": True,
            },
            "color": "#8b5cf6",
            "is_featured": True,
            "sort_order": 3,
        },
        {
            "name": "Enterprise",
            "code": "ent-tier",
            "tier": "enterprise",
            "description": "Unlimited power for hospital networks",
            "price": 10000000,
            "currency": "IDR",
            "billing_cycle": "monthly",
            "max_users": None,
            "max_storage_gb": None,
            "max_api_calls_per_day": None,
            "features": [
                "full_mwl",
                "full_orders",
                "dicom_viewer",
                "advanced_reports",
                "satusehat_integration",
                "api_access",
                "hl7_integration",
                "multi_modality",
                "unlimited_users",
                "dedicated_support",
            ],
            "spec": {
                "uptime": "99.99%",
                "support": "Dedicated Manager",
                "setup_fee": "Custom",
                "white_label": True,
            },
            "color": "#f59e0b",
            "is_featured": False,
            "sort_order": 4,
        },
    ]

    created_count = 0
    for prod_data in products_to_seed:
        existing = db.query(Product).filter(Product.code == prod_data["code"]).first()
        if not existing:
            db_product = Product(**prod_data)
            db.add(db_product)
            created_count += 1

    db.commit()

    return {"status": "success", "message": f"{created_count} products seeded."}


@router.get("/products", response_model=ProductListResponse)
async def list_products(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = db.query(Product)
    if not include_inactive:
        query = query.filter(Product.is_active == True)
    products = query.order_by(Product.sort_order.asc()).all()
    return {"items": products, "total": len(products)}


@router.post("/products", response_model=ProductResponse)
async def create_product(
    product: ProductCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(
            status_code=403, detail="Only superadmin can manage products"
        )

    existing = db.query(Product).filter(Product.code == product.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Product code already exists")

    db_product = Product(**product.model_dump())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product


@router.get("/products/{id}", response_model=ProductResponse)
async def get_product(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.put("/products/{id}", response_model=ProductResponse)
async def update_product(
    id: str,
    product: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(
            status_code=403, detail="Only superadmin can manage products"
        )

    db_product = db.query(Product).filter(Product.id == id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")

    for key, value in product.model_dump(exclude_unset=True).items():
        setattr(db_product, key, value)

    db.commit()
    db.refresh(db_product)
    return db_product


@router.delete("/products/{id}")
async def delete_product(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(
            status_code=403, detail="Only superadmin can manage products"
        )

    product = db.query(Product).filter(Product.id == id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    active_subs = (
        db.query(Subscription)
        .filter(Subscription.product_id == id, Subscription.status == "active")
        .count()
    )

    if active_subs > 0:
        raise HTTPException(
            status_code=400, detail="Cannot delete product with active subscriptions"
        )

    product.is_active = False
    db.commit()
    return {"status": "success", "message": "Product deactivated"}


@router.get("", response_model=SubscriptionListResponse)
async def list_subscriptions(
    tenant_id: Optional[str] = None,
    product_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = db.query(Subscription)

    if tenant_id:
        query = query.filter(Subscription.tenant_id == tenant_id)
    if product_id:
        query = query.filter(Subscription.product_id == product_id)
    if status:
        query = query.filter(Subscription.status == status)

    total = query.count()
    subs = query.offset((page - 1) * limit).limit(limit).all()

    # Convert UUID ids to strings for Pydantic validation
    result_items = []
    for sub in subs:
        item_dict = {}
        for key in dir(sub):
            if not key.startswith("_"):
                try:
                    val = getattr(sub, key)
                    if hasattr(val, "__class__") and val.__class__.__name__ == "UUID":
                        val = str(val)
                    # Handle related objects (tenant, product)
                    elif hasattr(
                        val, "__class__"
                    ) and "InstrumentedAttribute" not in str(type(val)):
                        if hasattr(val, "__dict__") and not key.startswith("_"):
                            nested_dict = {}
                            for attr in val.__dict__:
                                if not attr.startswith("_"):
                                    try:
                                        attr_val = getattr(val, attr)
                                        if (
                                            hasattr(attr_val, "__class__")
                                            and attr_val.__class__.__name__ == "UUID"
                                        ):
                                            attr_val = str(attr_val)
                                        nested_dict[attr] = attr_val
                                    except:
                                        pass
                            item_dict[key] = nested_dict
                            continue
                    item_dict[key] = val
                except:
                    pass
        result_items.append(item_dict)

    return {"items": result_items, "total": total}


@router.get("/with-details", response_model=List[SubscriptionWithDetails])
async def list_subscriptions_with_details(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = (
        db.query(Subscription, Tenant, Product)
        .join(Tenant, Subscription.tenant_id == Tenant.id)
        .join(Product, Subscription.product_id == Product.id)
    )

    if status:
        query = query.filter(Subscription.status == status)

    results = query.all()

    return [
        SubscriptionWithDetails(
            tenant_id=s.tenant_id,
            tenant_name=t.name,
            tenant_code=t.code,
            product_name=p.name,
            product_tier=p.tier,
            status=s.status,
            started_at=s.started_at,
            expires_at=s.expires_at,
            auto_renew=s.auto_renew,
            max_users=p.max_users,
            max_storage_gb=p.max_storage_gb,
            max_api_calls_per_day=p.max_api_calls_per_day,
            is_active=s.is_active,
        )
        for s, t, p in results
    ]


@router.post("", response_model=SubscriptionResponse)
async def create_subscription(
    sub: SubscriptionCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(
            status_code=403, detail="Only superadmin can manage subscriptions"
        )

    tenant = db.query(Tenant).filter(Tenant.id == sub.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    existing = (
        db.query(Subscription)
        .filter(
            Subscription.tenant_id == sub.tenant_id, Subscription.status == "active"
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400, detail="Tenant already has an active subscription"
        )

    db_sub = Subscription(**sub.model_dump())
    db.add(db_sub)
    db.commit()
    db.refresh(db_sub)
    return db_sub


@router.get("/{id}", response_model=SubscriptionResponse)
async def get_subscription(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    sub = db.query(Subscription).filter(Subscription.id == id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return sub


@router.put("/{id}", response_model=SubscriptionResponse)
async def update_subscription(
    id: str,
    sub: SubscriptionUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(
            status_code=403, detail="Only superadmin can manage subscriptions"
        )

    db_sub = db.query(Subscription).filter(Subscription.id == id).first()
    if not db_sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    for key, value in sub.model_dump(exclude_unset=True).items():
        setattr(db_sub, key, value)

    db.commit()
    db.refresh(db_sub)
    return db_sub


@router.delete("/{id}")
async def cancel_subscription(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(
            status_code=403, detail="Only superadmin can cancel subscriptions"
        )

    db_sub = db.query(Subscription).filter(Subscription.id == id).first()
    if not db_sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    db_sub.status = "cancelled"
    db_sub.cancelled_at = datetime.utcnow()
    db_sub.is_active = False
    db.commit()
    return {"status": "success", "message": "Subscription cancelled"}


@router.post("/{id}/renew")
async def renew_subscription(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(
            status_code=403, detail="Only superadmin can renew subscriptions"
        )

    db_sub = db.query(Subscription).filter(Subscription.id == id).first()
    if not db_sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    current_period = db_sub.billing_cycle or "monthly"
    months = 1 if current_period == "monthly" else 12

    if db_sub.expires_at:
        db_sub.expires_at = db_sub.expires_at.replace(
            month=db_sub.expires_at.month + months
        )
    else:
        from datetime import timedelta

        db_sub.expires_at = datetime.utcnow() + timedelta(days=30 * months)

    db_sub.status = "active"
    db_sub.is_active = True
    db_sub.renewal_at = datetime.utcnow()
    db.commit()
    return {
        "status": "success",
        "message": "Subscription renewed",
        "expires_at": db_sub.expires_at,
    }


@router.get("/usage/{tenant_id}", response_model=UsageResponse)
async def get_usage(
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if (
        current_user.get("role") != "SUPERADMIN"
        and current_user.get("tenant_id") != tenant_id
    ):
        raise HTTPException(status_code=403, detail="Access denied")

    sub = (
        db.query(Subscription)
        .filter(Subscription.tenant_id == tenant_id, Subscription.status == "active")
        .first()
    )

    if not sub:
        raise HTTPException(
            status_code=404, detail="No active subscription found for this tenant"
        )

    return {
        "tenant_id": tenant_id,
        "storage_bytes": 0,
        "api_calls_today": 0,
        "storage_limit_gb": sub.product.max_storage_gb,
        "api_limit_per_day": sub.product.max_api_calls_per_day,
        "tier_name": sub.product.name,
        "status": sub.status,
    }
