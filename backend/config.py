"""
Configurações do Backend Coinglass
Centraliza todas as configurações do aplicativo.
"""

import os
from functools import lru_cache
from typing import Optional


class Settings:
    """Configurações principais do aplicativo"""
    
    # App
    APP_NAME: str = "Coinglass API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "sqlite:///./coinglass.db"
    )
    DATABASE_ECHO: bool = os.getenv("DATABASE_ECHO", "false").lower() == "true"
    
    # Cache
    CACHE_TYPE: str = os.getenv("CACHE_TYPE", "memory")  # "memory" ou "redis"
    CACHE_DEFAULT_TTL: int = int(os.getenv("CACHE_DEFAULT_TTL", "300"))  # 5 minutos
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
    RATE_LIMIT_REQUESTS: int = int(os.getenv("RATE_LIMIT_REQUESTS", "100"))
    RATE_LIMIT_WINDOW: int = int(os.getenv("RATE_LIMIT_WINDOW", "60"))  # segundos
    
    # Autenticação
    API_KEY_HEADER: str = "X-API-Key"
    DEFAULT_API_KEY: str = os.getenv("DEFAULT_API_KEY", "coinglass-dev-key-2024")
    
    # APIs Externas
    COINAPI_KEY: str = os.getenv("COINAPI_KEY", "")
    COINALYZE_API_KEY: str = os.getenv("COINALYZE_API_KEY", "FREE")
    BINANCE_API_URL: str = "https://api.binance.com"
    COINGECKO_API_URL: str = "https://api.coingecko.com/api/v3"
    GECKOTERMINAL_API_URL: str = "https://api.geckoterminal.com/api/v2"
    
    # WebSocket
    WS_HEARTBEAT_INTERVAL: int = int(os.getenv("WS_HEARTBEAT_INTERVAL", "30"))
    WS_MAX_CONNECTIONS: int = int(os.getenv("WS_MAX_CONNECTIONS", "100"))
    
    # Alertas
    ALERT_CHECK_INTERVAL: int = int(os.getenv("ALERT_CHECK_INTERVAL", "60"))  # segundos
    ALERT_LOG_FILE: str = os.getenv("ALERT_LOG_FILE", "alerts.log")
    
    # CORS
    CORS_ORIGINS: list = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
    ]
    
    # Símbolos suportados
    SUPPORTED_SYMBOLS: list = [
        "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", 
        "AVAX", "DOT", "MATIC", "LINK", "UNI", "ATOM", "LTC"
    ]
    
    # Exchanges suportadas
    SUPPORTED_EXCHANGES: list = [
        "binance", "bybit", "okx", "huobi", "gate", "kucoin"
    ]
    
    # Timeouts
    REQUEST_TIMEOUT: int = int(os.getenv("REQUEST_TIMEOUT", "30"))
    
    def get_cors_origins(self) -> list:
        """Retorna origens CORS como lista"""
        origins = os.getenv("CORS_ORIGINS", "")
        if origins:
            return [o.strip() for o in origins.split(",")]
        return self.CORS_ORIGINS


@lru_cache()
def get_settings() -> Settings:
    """Retorna instância única de configurações (singleton)"""
    return Settings()


# Instância global de configurações
settings = get_settings()
