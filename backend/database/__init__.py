"""Database module exports"""

from backend.database.models import (
    Base,
    Liquidation,
    Price,
    Alert,
    APIKey,
    engine,
    SessionLocal,
    init_db,
    get_db
)

from backend.database.crud import (
    # Liquidations
    create_liquidation,
    get_liquidations,
    get_liquidation_by_id,
    get_liquidation_stats,
    bulk_create_liquidations,
    # Prices
    create_price,
    get_prices,
    get_latest_price,
    get_price_stats,
    # Alerts
    create_alert,
    get_alerts,
    get_alert_by_id,
    update_alert,
    delete_alert,
    trigger_alert,
    # API Keys
    create_api_key,
    get_api_key,
    verify_api_key,
    delete_api_key,
    get_all_api_keys
)

__all__ = [
    # Models
    "Base",
    "Liquidation",
    "Price", 
    "Alert",
    "APIKey",
    "engine",
    "SessionLocal",
    "init_db",
    "get_db",
    # CRUD - Liquidations
    "create_liquidation",
    "get_liquidations",
    "get_liquidation_by_id",
    "get_liquidation_stats",
    "bulk_create_liquidations",
    # CRUD - Prices
    "create_price",
    "get_prices",
    "get_latest_price",
    "get_price_stats",
    # CRUD - Alerts
    "create_alert",
    "get_alerts",
    "get_alert_by_id",
    "update_alert",
    "delete_alert",
    "trigger_alert",
    # CRUD - API Keys
    "create_api_key",
    "get_api_key",
    "verify_api_key",
    "delete_api_key",
    "get_all_api_keys"
]
