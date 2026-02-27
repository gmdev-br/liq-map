"""Analytics module exports"""

from backend.analytics.service import (
    AnalyticsService,
    get_liquidation_analytics,
    get_price_analytics,
    get_multi_exchange_analytics
)

__all__ = [
    "AnalyticsService",
    "get_liquidation_analytics",
    "get_price_analytics",
    "get_multi_exchange_analytics"
]
