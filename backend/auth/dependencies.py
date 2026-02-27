"""
Sistema de Autenticação e Autorização
Suporta API Keys com rate limiting.
"""

import hashlib
import secrets
import time
import logging
from typing import Optional, Dict
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import APIKeyHeader
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import get_db, get_api_key, verify_api_key

# Header para API Key
API_KEY_HEADER = APIKeyHeader(name=settings.API_KEY_HEADER, auto_error=False)

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Rate limiter simples baseado em memória.
    Limita requisições por API key em uma janela de tempo.
    """
    
    def __init__(self, requests: int = 100, window: int = 60):
        """
        Inicializa o rate limiter.
        
        Args:
            requests: Número máximo de requisições
            window: Janela de tempo em segundos
        """
        self.requests = requests
        self.window = window
        self._requests: Dict[str, list] = {}
    
    def is_allowed(self, key: str) -> bool:
        """
        Verifica se a requisição é permitida.
        
        Args:
            key: Identificador (API key ou IP)
            
        Returns:
            True se permitido, False se excedeu limite
        """
        current_time = time.time()
        
        if key not in self._requests:
            self._requests[key] = []
        
        # Remove requisições antigas
        self._requests[key] = [
            t for t in self._requests[key]
            if current_time - t < self.window
        ]
        
        # Verifica limite
        if len(self._requests[key]) >= self.requests:
            return False
        
        # Adiciona requisição atual
        self._requests[key].append(current_time)
        return True
    
    def get_remaining(self, key: str) -> int:
        """Retorna número de requisições restantes"""
        current_time = time.time()
        
        if key not in self._requests:
            return self.requests
        
        recent = [
            t for t in self._requests[key]
            if current_time - t < self.window
        ]
        
        return max(0, self.requests - len(recent))
    
    def reset(self, key: str) -> None:
        """Reseta o contador para uma chave"""
        if key in self._requests:
            del self._requests[key]


# Instância global do rate limiter
rate_limiter = RateLimiter(
    requests=settings.RATE_LIMIT_REQUESTS,
    window=settings.RATE_LIMIT_WINDOW
)


def generate_api_key() -> str:
    """
    Gera uma nova chave de API segura.
    
    Returns:
        String de 64 caracteres hexadecimal
    """
    return secrets.token_hex(32)


def hash_api_key(key: str) -> str:
    """
    Hash de uma API key para armazenamento seguro.
    
    Args:
        key: API key em texto plain
        
    Returns:
        Hash SHA-256 da chave
    """
    return hashlib.sha256(key.encode()).hexdigest()


async def get_current_api_key(
    request: Request,
    api_key_header: Optional[str] = Depends(API_KEY_HEADER),
    db: Session = Depends(get_db)
) -> str:
    """
    Dependência FastAPI para obter e validar API key.
    
    Args:
        request: Requisição HTTP
        api_key_header: Valor do header X-API-Key
        db: Sessão do banco de dados
        
    Returns:
        API key validada
        
    Raises:
        HTTPException: Se a chave for inválida ou rate limit excedido
    """
    # Se rate limiting está desabilitado, aceita qualquer chave
    if not settings.RATE_LIMIT_ENABLED:
        return api_key_header or settings.DEFAULT_API_KEY
    
    # Usa IP como fallback se não houver API key
    client_key = api_key_header
    if not client_key:
        client_key = request.client.host if request.client else "anonymous"
    
    # Verifica rate limit primeiro (mais rápido)
    if not rate_limiter.is_allowed(client_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "Rate limit exceeded",
                "message": f"Máximo de {settings.RATE_LIMIT_REQUESTS} requisições "
                          f"por {settings.RATE_LIMIT_WINDOW} segundos",
                "retry_after": settings.RATE_LIMIT_WINDOW
            },
            headers={"Retry-After": str(settings.RATE_LIMIT_WINDOW)}
        )
    
    # Se for a chave padrão, permite
    if client_key == settings.DEFAULT_API_KEY:
        return client_key
    
    # Valida API key no banco de dados
    if api_key_header:
        is_valid = verify_api_key(db, api_key_header)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "error": "Invalid API key",
                    "message": "A API key fornecida é inválida ou expirou"
                }
            )
        
        # Verifica rate limit específico da chave
        db_key = get_api_key(db, api_key_header)
        if db_key:
            key_rate_limit = db_key.rate_limit
            if not rate_limiter.is_allowed(f"api:{api_key_header}"):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "error": "Rate limit exceeded",
                        "message": f"Limite de {key_rate_limit} requisições por minuto excedido"
                    },
                    headers={"Retry-After": str(settings.RATE_LIMIT_WINDOW)}
                )
    
    return client_key


async def get_optional_api_key(
    api_key_header: Optional[str] = Depends(API_KEY_HEADER)
) -> Optional[str]:
    """
    Dependência opcional para API key.
    Retorna None se não fornecida.
    
    Args:
        api_key_header: Valor do header X-API-Key
        
    Returns:
        API key ou None
    """
    if api_key_header == settings.DEFAULT_API_KEY:
        return None
    
    return api_key_header


class APIKeyManager:
    """
    Gerenciador de API Keys.
    Facilita a criação e gerenciamento de chaves.
    """
    
    @staticmethod
    def create_key(
        db: Session,
        name: str,
        owner: Optional[str] = None,
        rate_limit: int = 100,
        days_until_expiry: Optional[int] = None
    ) -> tuple:
        """
        Cria uma nova API key.
        
        Args:
            db: Sessão do banco
            name: Nome identificador
            owner: Proprietário (opcional)
            rate_limit: Limite de requisições por minuto
            days_until_expiry: Dias até expirar (None = nunca)
            
        Returns:
            Tupla (api_key, APIKey object)
        """
        from datetime import datetime, timedelta
        
        api_key = generate_api_key()
        
        expires_at = None
        if days_until_expiry:
            expires_at = datetime.utcnow() + timedelta(days=days_until_expiry)
        
        db_key = create_api_key(
            db=db,
            key=api_key,
            name=name,
            owner=owner,
            rate_limit=rate_limit,
            expires_at=expires_at
        )
        
        return api_key, db_key
    
    @staticmethod
    def revoke_key(db: Session, api_key: str) -> bool:
        """Revoga uma API key (desativa)"""
        from backend.database import get_api_key, update_alert
        
        key_obj = get_api_key(db, api_key)
        if not key_obj:
            return False
        
        update_alert(db, key_obj.id, is_active=False)
        return True


# Dependency para rate limiting
def check_rate_limit(request: Request):
    """
    Dependência simples para verificar rate limit por IP.
    """
    if not settings.RATE_LIMIT_ENABLED:
        return
    
    client_ip = request.client.host if request.client else "unknown"
    
    if not rate_limiter.is_allowed(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(settings.RATE_LIMIT_WINDOW)}
        )
