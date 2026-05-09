"""
Configuration Module
Loads and validates configuration from environment variables
"""

import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator, computed_field


class Settings(BaseSettings):
    """Application Settings"""

    model_config = SettingsConfigDict(
        env_file=".env.pacs",
        env_file_encoding="utf-8",
        case_sensitive=False
    )

    # Application
    app_name: str = Field(default="PACS Service", env="API_TITLE")
    app_version: str = Field(default="1.0.0", env="API_VERSION")
    api_prefix: str = Field(default="/api", env="API_PREFIX")
    debug: bool = Field(default=False, env="DEBUG")

    # Database
    database_url: str = Field(default="postgresql://dicom:dicom@dicom-postgres-secured:5432/worklist_db", env="DATABASE_URL")
    db_host: str = "dicom-postgres-secured"
    db_port: int = 5432
    db_name: str = "worklist_db"
    db_user: str = "dicom"
    db_password: str = ""

    # Orthanc
    orthanc_url: str = "http://orthanc:8042"
    orthanc_username: str = "orthanc"
    orthanc_password: str = "orthanc"

    # SatuSehat DICOM Router
    dicom_router_host: str = "dicom-router-secured"
    dicom_router_port: int = 11112
    dicom_router_ae_title: str = "DCMROUTER"
    dicom_router_calling_ae_title: str = "PACS_SCU"
    dicom_router_timeout: int = 60

    # SatuSehat Integration (via API Gateway)
    satusehat_gateway_url: str = "http://api-gateway:8888"
    satusehat_lookup_timeout: int = 15

    # JWT
    jwt_secret: str = Field(default="dev-secret-key-12345", env="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", env="JWT_ALGORITHM")
    jwt_expiration_hours: int = Field(default=24, env="JWT_EXPIRATION_HOURS")

    # Security
    secret_key: str = "dev-secret-change-in-production"  # For CSRF and other security features

    # RBAC (stored as string, parsed to list via property)
    allowed_roles_str: str = Field(default="superadmin,developer", env="ALLOWED_ROLES")
    require_role_check: bool = Field(default=True, env="REQUIRE_ROLE_CHECK")

    @computed_field
    @property
    def allowed_roles(self) -> List[str]:
        """Parse allowed roles from comma-separated string"""
        if not self.allowed_roles_str or self.allowed_roles_str.strip() == "":
            return []
        return [role.strip() for role in self.allowed_roles_str.split(",") if role.strip()]
    
    # Storage — local
    storage_path: str = Field(default="/var/lib/pacs/storage", env="STORAGE_PATH")
    storage_adapter: str = Field(default="local", env="STORAGE_ADAPTER")
    max_storage_gb: int = Field(default=500, env="MAX_STORAGE_GB")
    storage_warning_threshold: int = Field(default=80, env="STORAGE_WARNING_THRESHOLD")
    storage_critical_threshold: int = Field(default=90, env="STORAGE_CRITICAL_THRESHOLD")

    # Storage — S3 / S3-compatible (MinIO, Contabo, Wasabi, etc.)
    s3_bucket_name: str = Field(default="", env="S3_BUCKET_NAME")
    s3_access_key: str = Field(default="", env="S3_ACCESS_KEY")
    s3_secret_key: str = Field(default="", env="S3_SECRET_KEY")
    s3_region: str = Field(default="us-east-1", env="S3_REGION")
    s3_endpoint_url: str = Field(default="", env="S3_ENDPOINT_URL")
    s3_use_ssl: bool = Field(default=True, env="S3_USE_SSL")
    s3_addressing_style: str = Field(default="auto", env="S3_ADDRESSING_STYLE")
    s3_auto_create_bucket: bool = Field(default=False, env="S3_AUTO_CREATE_BUCKET")
    
    # Retention
    retention_days: int = Field(default=365, env="RETENTION_DAYS")
    auto_cleanup_enabled: bool = Field(default=False, env="AUTO_CLEANUP_ENABLED")
    
    # Feature Flags
    pacs_enabled: bool = Field(default=True, env="PACS_ENABLED")
    reports_enabled: bool = Field(default=True, env="REPORTS_ENABLED")
    auto_link_orders: bool = Field(default=True, env="AUTO_LINK_ORDERS")
    
    # Logging
    log_level: str = Field(default="DEBUG", env="LOG_LEVEL")
    log_format: str = Field(default="json", env="LOG_FORMAT")
    
    # CORS (stored as string, parsed to list via property)
    cors_origins_str: str = Field(
        default="http://localhost:5173,http://localhost:3000",
        env="CORS_ORIGINS"
    )
    cors_allow_credentials: bool = Field(default=True, env="CORS_ALLOW_CREDENTIALS")

    @computed_field
    @property
    def cors_origins(self) -> List[str]:
        """Parse CORS origins from comma-separated string"""
        if not self.cors_origins_str or self.cors_origins_str.strip() == "":
            return []
        return [origin.strip() for origin in self.cors_origins_str.split(",") if origin.strip()]

    # Impersonate Feature
    impersonate_enabled: bool = Field(default=True, env="IMPERSONATE_ENABLED")
    impersonate_timeout_minutes: int = Field(default=30, env="IMPERSONATE_TIMEOUT_MINUTES")
    impersonate_warning_minutes: int = Field(default=5, env="IMPERSONATE_WARNING_MINUTES")
    impersonate_cleanup_interval_minutes: int = Field(default=5, env="IMPERSONATE_CLEANUP_INTERVAL_MINUTES")
    
    # AI / LLM Settings
    ai_provider: str = Field(default="mock", env="AI_PROVIDER")  # mock, gemini, openai
    gemini_api_key: str = Field(default="", env="GEMINI_API_KEY")
    ai_model_name: str = Field(default="gemini-pro", env="AI_MODEL_NAME")
    ai_api_base_url: str = Field(default="", env="AI_API_BASE_URL")  # Optional override for proxies/Ollama

    # Monitoring
    enable_metrics: bool = Field(default=True, env="ENABLE_METRICS")
    enable_docs: bool = Field(default=True, env="ENABLE_DOCS")

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v):
        """Validate log level"""
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if v.upper() not in valid_levels:
            raise ValueError(f"Invalid log level. Must be one of: {valid_levels}")
        return v.upper()

    @field_validator("storage_warning_threshold", "storage_critical_threshold")
    @classmethod
    def validate_threshold(cls, v):
        """Validate threshold percentage"""
        if not 0 <= v <= 100:
            raise ValueError("Threshold must be between 0 and 100")
        return v

    @field_validator("dicom_router_port")
    @classmethod
    def validate_router_port(cls, v: int) -> int:
        """Validate DICOM router port"""
        if not 1 <= v <= 65535:
            raise ValueError("DICOM router port must be between 1 and 65535")
        return v

    @field_validator("dicom_router_timeout")
    @classmethod
    def validate_router_timeout(cls, v: int) -> int:
        """Validate DICOM router timeout"""
        if v <= 0:
            raise ValueError("DICOM router timeout must be positive")
        return v

    @field_validator("satusehat_gateway_url")
    @classmethod
    def validate_gateway_url(cls, v: str) -> str:
        """Ensure gateway URL is non-empty"""
        if not v or not v.strip():
            raise ValueError("SATUSEHAT_GATEWAY_URL cannot be empty")
        return v.strip()

    @field_validator("satusehat_lookup_timeout")
    @classmethod
    def validate_lookup_timeout(cls, v: int) -> int:
        """Validate lookup timeout"""
        if v <= 0:
            raise ValueError("SATUSEHAT_LOOKUP_TIMEOUT must be positive")
        return v

    @field_validator("impersonate_timeout_minutes")
    @classmethod
    def validate_impersonate_timeout(cls, v: int) -> int:
        """Validate impersonate timeout"""
        if v <= 0:
            raise ValueError("IMPERSONATE_TIMEOUT_MINUTES must be positive")
        if v > 1440:  # Max 24 hours
            raise ValueError("IMPERSONATE_TIMEOUT_MINUTES cannot exceed 1440 (24 hours)")
        return v

    @field_validator("impersonate_warning_minutes")
    @classmethod
    def validate_impersonate_warning(cls, v: int) -> int:
        """Validate impersonate warning time"""
        if v <= 0:
            raise ValueError("IMPERSONATE_WARNING_MINUTES must be positive")
        if v > 60:  # Max 60 minutes
            raise ValueError("IMPERSONATE_WARNING_MINUTES cannot exceed 60")
        return v

    @field_validator("impersonate_cleanup_interval_minutes")
    @classmethod
    def validate_impersonate_cleanup_interval(cls, v: int) -> int:
        """Validate impersonate cleanup interval"""
        if v <= 0:
            raise ValueError("IMPERSONATE_CLEANUP_INTERVAL_MINUTES must be positive")
        if v > 60:  # Max 60 minutes
            raise ValueError("IMPERSONATE_CLEANUP_INTERVAL_MINUTES cannot exceed 60")
        return v


# Create settings instance
settings = Settings()


# Helper functions
def get_database_url() -> str:
    """Get database URL"""
    return settings.database_url


def is_feature_enabled(feature: str) -> bool:
    """Check if a feature is enabled"""
    feature_flags = {
        "pacs": settings.pacs_enabled,
        "reports": settings.reports_enabled,
        "auto_link_orders": settings.auto_link_orders,
    }
    return feature_flags.get(feature, False)


def is_role_allowed(role: str) -> bool:
    """Check if a role is allowed to access PACS"""
    if not settings.require_role_check:
        return True
    return role.lower() in [r.lower() for r in settings.allowed_roles]
