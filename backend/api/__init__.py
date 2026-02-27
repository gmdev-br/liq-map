"""API module exports"""

from backend.api.routes import router, compat_router
from backend.api.schemas import PaginatedResponse

__all__ = ["router", "compat_router", "PaginatedResponse"]
