"""
Sistema de Cache com suporte a Redis e fallback em memória (LRU)
"""

import json
import time
from typing import Any, Optional, Dict, Callable
from functools import wraps
from collections import OrderedDict
import logging

from backend.config import settings

logger = logging.getLogger(__name__)


class LRUCache:
    """
    Cache LRU (Least Recently Used) em memória.
    Implementação simples com OrderedDict para manter ordem de acesso.
    """
    
    def __init__(self, max_size: int = 1000):
        """
        Inicializa o cache LRU.
        
        Args:
            max_size: Número máximo de itens no cache
        """
        self._cache: OrderedDict = OrderedDict()
        self._ttl: Dict[str, float] = {}
        self.max_size = max_size
    
    def get(self, key: str) -> Optional[Any]:
        """
        Obtém valor do cache.
        
        Args:
            key: Chave do cache
            
        Returns:
            Valor armazenado ou None se não existir/expirado
        """
        # Verifica se a chave existe
        if key not in self._cache:
            return None
        
        # Verifica TTL
        if key in self._ttl and time.time() > self._ttl[key]:
            self.delete(key)
            return None
        
        # Move para o final (mais recentemente usado)
        self._cache.move_to_end(key)
        
        return self._cache[key]
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """
        Define valor no cache.
        
        Args:
            key: Chave do cache
            value: Valor a armazenar
            ttl: Tempo de vida em segundos (opcional)
        """
        # Remove se já existir para atualizar
        if key in self._cache:
            self._cache.move_to_end(key)
        
        # Adiciona novo valor
        self._cache[key] = value
        
        # Define TTL se fornecido
        if ttl:
            self._ttl[key] = time.time() + ttl
        
        # Remove itens mais antigos se exceder tamanho máximo
        while len(self._cache) > self.max_size:
            oldest_key = next(iter(self._cache))
            self.delete(oldest_key)
    
    def delete(self, key: str) -> None:
        """Remove chave do cache"""
        self._cache.pop(key, None)
        self._ttl.pop(key, None)
    
    def clear(self) -> None:
        """Limpa todo o cache"""
        self._cache.clear()
        self._ttl.clear()
    
    def size(self) -> int:
        """Retorna número de itens no cache"""
        return len(self._cache)
    
    def keys(self) -> list:
        """Retorna todas as chaves"""
        return list(self._cache.keys())


class RedisCache:
    """
    Cache usando Redis.
    Requer redis-py instalado e servidor Redis disponível.
    """
    
    def __init__(self, url: str = None, default_ttl: int = 300):
        """
        Inicializa cache Redis.
        
        Args:
            url: URL de conexão Redis
            default_ttl: TTL padrão em segundos
        """
        self.url = url or settings.REDIS_URL
        self.default_ttl = default_ttl
        self._client = None
        self._connected = False
    
    def _get_client(self):
        """Obtém cliente Redis (lazy loading)"""
        if self._client is None:
            try:
                import redis
                self._client = redis.from_url(
                    self.url,
                    decode_responses=True,
                    socket_timeout=5,
                    socket_connect_timeout=5
                )
                # Testa conexão
                self._client.ping()
                self._connected = True
                logger.info("Conectado ao Redis com sucesso")
            except ImportError:
                logger.warning("redis-py não instalado, usando cache em memória")
                self._connected = False
            except Exception as e:
                logger.warning(f"Erro ao conectar ao Redis: {e}")
                self._connected = False
        return self._client
    
    def get(self, key: str) -> Optional[Any]:
        """Obtém valor do cache Redis"""
        if not self._connected:
            return None
        
        try:
            client = self._get_client()
            if not client:
                return None
            
            value = client.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.error(f"Erro ao obter do Redis: {e}")
            return None
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Define valor no cache Redis"""
        if not self._connected:
            return
        
        try:
            client = self._get_client()
            if not client:
                return
            
            ttl = ttl or self.default_ttl
            serialized = json.dumps(value)
            client.setex(key, ttl, serialized)
        except Exception as e:
            logger.error(f"Erro ao definir no Redis: {e}")
    
    def delete(self, key: str) -> None:
        """Remove chave do cache Redis"""
        if not self._connected:
            return
        
        try:
            client = self._get_client()
            if client:
                client.delete(key)
        except Exception as e:
            logger.error(f"Erro ao deletar do Redis: {e}")
    
    def clear(self) -> None:
        """Limpa todo o cache Redis"""
        if not self._connected:
            return
        
        try:
            client = self._get_client()
            if client:
                client.flushdb()
        except Exception as e:
            logger.error(f"Erro ao limpar Redis: {e}")
    
    def size(self) -> int:
        """Retorna número de itens no cache"""
        if not self._connected:
            return 0
        
        try:
            client = self._get_client()
            if client:
                return client.dbsize()
        except Exception as e:
            logger.error(f"Erro ao verificar tamanho do Redis: {e}")
        return 0


class CacheManager:
    """
    Gerenciador de cache unificado.
    Usa Redis se disponível, caso contrário usa LRU em memória.
    """
    
    def __init__(self):
        """Inicializa o gerenciador de cache"""
        self._memory_cache = LRUCache(max_size=1000)
        
        # Tenta usar Redis
        if settings.CACHE_TYPE == "redis":
            self._redis_cache = RedisCache(
                url=settings.REDIS_URL,
                default_ttl=settings.CACHE_DEFAULT_TTL
            )
            self._use_redis = True
        else:
            self._redis_cache = None
            self._use_redis = False
    
    def get(self, key: str) -> Optional[Any]:
        """Obtém valor do cache"""
        # Tenta Redis primeiro
        if self._use_redis and self._redis_cache:
            value = self._redis_cache.get(key)
            if value is not None:
                logger.debug(f"Cache hit (Redis): {key}")
                return value
        
        # Fallback para memória
        value = self._memory_cache.get(key)
        if value is not None:
            logger.debug(f"Cache hit (Memory): {key}")
        else:
            logger.debug(f"Cache miss: {key}")
        
        return value
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Define valor no cache"""
        ttl = ttl or settings.CACHE_DEFAULT_TTL
        
        # Salva em ambos os caches
        if self._use_redis and self._redis_cache:
            self._redis_cache.set(key, value, ttl)
        
        self._memory_cache.set(key, value, ttl)
        logger.debug(f"Cache set: {key} (TTL: {ttl}s)")
    
    def delete(self, key: str) -> None:
        """Remove chave do cache"""
        if self._use_redis and self._redis_cache:
            self._redis_cache.delete(key)
        self._memory_cache.delete(key)
    
    def clear(self) -> None:
        """Limpa todo o cache"""
        if self._use_redis and self._redis_cache:
            self._redis_cache.clear()
        self._memory_cache.clear()
        logger.info("Cache limpo")
    
    def size(self) -> int:
        """Retorna número de itens no cache"""
        if self._use_redis and self._redis_cache:
            redis_size = self._redis_cache.size()
            if redis_size > 0:
                return redis_size
        return self._memory_cache.size()


# Instância global do cache
cache = CacheManager()


def cached(ttl: Optional[int] = None, key_builder: Optional[Callable] = None):
    """
    Decorador para cachear funções.
    
    Args:
        ttl: Tempo de vida do cache em segundos
        key_builder: Função para construir chave do cache
        
    Exemplo:
        @cached(ttl=300)
        def get_data(symbol: str):
            return fetch_data(symbol)
    """
    def decorator(func: Callable):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            # Constrói chave do cache
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                # Constrói chave padrão baseada no nome da função e args
                key_parts = [func.__module__, func.__name__]
                key_parts.extend(str(arg) for arg in args)
                key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
                cache_key = ":".join(key_parts)
            
            # Tenta obter do cache
            cached_value = cache.get(cache_key)
            if cached_value is not None:
                return cached_value
            
            # Executa função
            result = await func(*args, **kwargs)
            
            # Salva no cache
            cache.set(cache_key, result, ttl)
            
            return result
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            # Constrói chave do cache
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                key_parts = [func.__module__, func.__name__]
                key_parts.extend(str(arg) for arg in args)
                key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
                cache_key = ":".join(key_parts)
            
            # Tenta obter do cache
            cached_value = cache.get(cache_key)
            if cached_value is not None:
                return cached_value
            
            # Executa função
            result = func(*args, **kwargs)
            
            # Salva no cache
            cache.set(cache_key, result, ttl)
            
            return result
        
        # Retorna wrapper apropriado baseado se a função é async
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


# Funções de conveniência
def invalidate_cache(pattern: str = None):
    """
    Invalida cache baseado em padrão.
    
    Args:
        pattern: Padrão de chaves a remover (ex: "liquidation:*")
    """
    if pattern:
        # Para Redis, usa SCAN
        if cache._use_redis and cache._redis_cache:
            try:
                import redis
                client = cache._redis_cache._get_client()
                if client:
                    for key in client.scan_iter(match=pattern):
                        client.delete(key)
            except Exception as e:
                logger.error(f"Erro ao invalidar cache Redis: {e}")
        
        # Para memória, precisa iterar
        for key in cache._memory_cache.keys():
            if pattern.replace("*", "") in key:
                cache.delete(key)
    else:
        cache.clear()
