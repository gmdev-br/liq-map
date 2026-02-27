"""
Rotas da API Principal
Endpoints para liquidações, preços, exchanges e símbolos.
"""

import httpx
import requests
import logging
import json
import os
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.config import settings
from backend.database import get_db
from backend.auth import get_current_api_key
from backend.cache import cache, cached

logger = logging.getLogger(__name__)

# Router
router = APIRouter(prefix="/api/v1", tags=["API"])

# Arquivo para salvar API keys validadas
API_KEYS_FILE = "coinalyze_keys.json"


def _get_api_keys_file_path() -> str:
    """Retorna o caminho do arquivo de chaves de API"""
    return os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), API_KEYS_FILE)


def load_saved_api_keys() -> dict:
    """Carrega as chaves de API salvas em arquivo"""
    try:
        file_path = _get_api_keys_file_path()
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                return json.load(f)
    except Exception as e:
        logger.warning(f"Erro ao carregar chaves de API salvas: {e}")
    return {}


def save_api_key(provider: str, api_key: str) -> bool:
    """
    Salva a chave de API validada em arquivo e atualiza a configuração em memória.
    
    Args:
        provider: O provedor ('coinapi' ou 'coinalyze')
        api_key: A chave de API a ser salva
    
    Returns:
        True se salvou com sucesso, False caso contrário
    """
    try:
        # Carrega chaves existentes
        keys = load_saved_api_keys()
        
        # Adiciona/atualiza a chave
        keys[provider] = {
            "api_key": api_key,
            "updated_at": datetime.now().isoformat()
        }
        
        # Salva no arquivo
        file_path = _get_api_keys_file_path()
        with open(file_path, 'w') as f:
            json.dump(keys, f, indent=2)
        
        # Atualiza a configuração em memória
        if provider == "coinalyze":
            settings.COINALYZE_API_KEY = api_key
        elif provider == "coinapi":
            settings.COINAPI_KEY = api_key
        
        logger.info(f"Chave de API do {provider} salva com sucesso")
        return True
        
    except Exception as e:
        logger.error(f"Erro ao salvar chave de API: {e}")
        return False


def initialize_saved_api_keys():
    """Inicializa as chaves de API salvas ao iniciar o servidor"""
    keys = load_saved_api_keys()
    if "coinalyze" in keys:
        settings.COINALYZE_API_KEY = keys["coinalyze"].get("api_key", "FREE")
        logger.info(f"API key da Coinalyze carregada: {settings.COINALYZE_API_KEY[:10]}...")
    if "coinapi" in keys:
        settings.COINAPI_KEY = keys["coinapi"].get("api_key", "")
        logger.info(f"API key da CoinAPI carregada")


# Inicializa as chaves ao importar o módulo
initialize_saved_api_keys()


# ==================== MODELS ====================

class LiquidationResponse(BaseModel):
    """Modelo de resposta para liquidação"""
    liquidation_id: str
    exchange: str
    symbol: str
    pair: str
    price: float
    quantity: float
    value_usd: Optional[float]
    side: Optional[str]
    timestamp: str


class PriceResponse(BaseModel):
    """Modelo de resposta para preço"""
    symbol: str
    exchange: str
    price: float
    volume: Optional[float]
    timestamp: str


class ExchangeResponse(BaseModel):
    """Modelo de resposta para exchange"""
    id: str
    name: str
    supported_symbols: List[str]


class SymbolResponse(BaseModel):
    """Modelo de resposta para símbolo"""
    symbol: str
    name: str
    exchanges: List[str]


# ==================== LIQUIDATIONS ====================

@router.get("/liquidations")
async def get_liquidation_history(
    symbols: Optional[str] = Query(None, description="Símbolos separados por vírgula (ex: BTC,ETH)"),
    interval: str = Query("daily", description="Intervalo: daily, hourly"),
    from_time: Optional[int] = Query(None, description="Timestamp Unix de início"),
    to_time: Optional[int] = Query(None, description="Timestamp Unix de fim"),
    amount_min: Optional[float] = Query(None, description="Valor mínimo de liquidação em USD"),
    amount_max: Optional[float] = Query(None, description="Valor máximo de liquidação em USD"),
    db: Session = Depends(get_db),
    current_key: str = Depends(get_current_api_key)
):
    """
    Obtém histórico de liquidações.
    
    Migração do endpoint Flask /api/liquidation-history
    """
    # Valor padrão se symbols não for fornecido
    if not symbols:
        symbols = "BTC"

    # Valores padrão: últimos 30 dias se não fornecidos
    if from_time is None:
        from_time = int((datetime.now() - timedelta(days=30)).timestamp())
    if to_time is None:
        to_time = int(datetime.now().timestamp())

    # Constrói chave de cache
    cache_key = f"liquidation:{symbols}:{interval}:{from_time}:{to_time}"
    
    # Tenta cache
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data
    
    # Chama API Coinalyze
    coinalyze_url = "https://api.coinalyze.net/v1/liquidation-history"
    params = {
        "symbols": symbols,
        "interval": interval,
        "api_key": settings.COINALYZE_API_KEY,
        "from": from_time,
        "to": to_time
    }
    
    # Log detalhado para debug do erro 502
    api_key_display = settings.COINALYZE_API_KEY
    if api_key_display and len(api_key_display) > 8:
        api_key_display = f"{api_key_display[:4]}...{api_key_display[-4:]}"
    logger.info(f"[LIQUIDATIONS] Requisição para Coinalyze - API Key: {api_key_display}, Símbolos: {symbols}, Intervalo: {interval}, from_time: {from_time}, to_time: {to_time}")
    
    try:
        response = requests.get(coinalyze_url, params=params, timeout=30)
        
        # Log do status da resposta
        logger.info(f"[LIQUIDATIONS] Resposta Coinalyze - Status: {response.status_code}, Símbolos: {symbols}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Transforma os dados para o formato esperado pelo frontend
            # API Coinalyze retorna: time, value_usd, exchange, l (longs), s (shorts), price
            # Frontend espera: timestamp, amount, exchange, side, price
            transformed_data = []
            for item in data:
                # Determina o lado predominante (long ou short)
                long_liq = item.get('l', 0)
                short_liq = item.get('s', 0)
                side = "long" if long_liq > short_liq else "short"
                
                transformed_data.append({
                    "id": str(item.get("time", "")),  # Usa time como id
                    "timestamp": item.get("time", 0),
                    "amount": item.get("value_usd", 0),
                    "exchange": item.get("exchange", "unknown"),
                    "side": side,
                    "price": item.get("price", 0),
                    "symbol": item.get("symbol", ""),
                    "long_liquidation": long_liq,
                    "short_liquidation": short_liq
                })
            
            # Usa os dados transformados para filtrar por amount_min e amount_max
            if amount_min is not None or amount_max is not None:
                filtered_data = []
                for item in transformed_data:
                    amount = item.get('amount', 0)
                    if amount_min is not None and amount < amount_min:
                        continue
                    if amount_max is not None and amount > amount_max:
                        continue
                    filtered_data.append(item)
                transformed_data = filtered_data
            
            # Salva no cache por 5 minutos
            cache.set(cache_key, transformed_data, ttl=300)
            
            # Opcional: salva no banco de dados
            # bulk_create_liquidations(db, data)
            
            return transformed_data
        elif response.status_code == 401:
            # Handle upstream auth failure gracefully
            logger.warning(f"Upstream API (Coinalyze) returned 401 Unauthorized for symbols: {symbols}. Returning empty list.")
            return []
        else:
            raise HTTPException(
                status_code=502, # Bad Gateway - upstream error
                detail=f"Erro da API Coinalyze ({response.status_code}): {response.text}"
            )
    except requests.RequestException as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao conectar com Coinalyze: {str(e)}"
        )


@router.get("/liquidations/{liquidation_id}")
async def get_liquidation(
    liquidation_id: str,
    db: Session = Depends(get_db),
    current_key: str = Depends(get_current_api_key)
):
    """Obtém uma liquidação específica do banco de dados local"""
    from backend.database import get_liquidation_by_id
    
    liquidation = get_liquidation_by_id(db, liquidation_id)
    if not liquidation:
        raise HTTPException(status_code=404, detail="Liquidação não encontrada")
    
    return liquidation


@router.get("/liquidations/stats")
async def get_liquidation_stats(
    symbol: Optional[str] = Query(None, description="Símbolo específico"),
    exchange: Optional[str] = Query(None, description="Exchange específica"),
    days: int = Query(30, description="Número de dias para buscar"),
    db: Session = Depends(get_db),
    current_key: str = Depends(get_current_api_key)
):
    """
    Obtém estatísticas de liquidações do banco de dados local.
    """
    from backend.database import get_liquidation_stats as db_stats
    
    start_time = datetime.utcnow() - timedelta(days=days)
    end_time = datetime.utcnow()
    
    stats = db_stats(
        db=db,
        symbol=symbol,
        exchange=exchange,
        start_time=start_time,
        end_time=end_time
    )
    
    return {
        "period": f"{days} days",
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "stats": stats
    }


@router.get("/analytics/liquidations")
async def get_liquidation_analytics(
    symbol: Optional[str] = Query(None, description="Símbolo específico"),
    exchange: Optional[str] = Query(None, description="Exchange específica"),
    days: int = Query(30, description="Número de dias para buscar"),
    db: Session = Depends(get_db),
    current_key: str = Depends(get_current_api_key)
):
    """
    Obtém análises de liquidações com estatísticas consolidadas.
    Retorna dados no formato esperado pelo frontend.
    """
    from backend.analytics.service import get_liquidation_analytics as analytics
    
    result = analytics(
        db=db,
        symbol=symbol,
        exchange=exchange,
        days=days
    )
    
    # Mapeia para o formato esperado pelo frontend
    return {
        "total_liquidations": result.get("total_count", 0),
        "total_volume": result.get("total_volume", 0),
        "largest_liquidation": result.get("max_volume", 0),
        "avg_liquidation": result.get("avg_volume", 0),
        "by_exchange": result.get("by_exchange", {}),
        "by_symbol": result.get("by_symbol", {}),
        "by_side": {
            "long": result.get("long_count", 0),
            "short": result.get("short_count", 0)
        }
    }


# ==================== PRICES ====================

@router.get("/prices")
async def get_price_history(
    symbols: str = Query(..., description="Símbolos (ex: BTCUSDT_PERP.A)"),
    from_time: int = Query(..., description="Timestamp Unix de início"),
    to_time: int = Query(..., description="Timestamp Unix de fim"),
    db: Session = Depends(get_db),
    current_key: str = Depends(get_current_api_key)
):
    """
    Obtém histórico de preços.
    
    Tenta: Binance -> GeckoTerminal -> CoinGecko
    Migração do endpoint Flask /api/price-history
    """
    # Constrói chave de cache
    cache_key = f"price:{symbols}:{from_time}:{to_time}"
    
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data
    
    # Converte símbolo
    symbol_map = {
        "BTCUSDT_PERP.A": "BTCUSDT",
        "ETHUSDT_PERP.A": "ETHUSDT",
        "SOLUSDT_PERP.A": "SOLUSDT",
        "XRPUSDT_PERP.A": "XRPUSDT",
        "ADAUSDT_PERP.A": "ADAUSDT"
    }
    
    binance_symbol = symbol_map.get(symbols, "BTCUSDT")
    days_range = (to_time - from_time) / (24 * 60 * 60)
    
    # Tenta Binance
    try:
        binance_url = "https://api.binance.com/api/v3/klines"
        params = {
            "symbol": binance_symbol,
            "interval": "1d",
            "startTime": from_time * 1000,
            "endTime": to_time * 1000,
            "limit": 1000
        }
        
        response = requests.get(binance_url, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            
            if isinstance(data, list) and len(data) > 0:
                formatted_data = []
                for item in data:
                    formatted_data.append({
                        "t": item[0] // 1000,
                        "c": item[4]
                    })
                
                cache.set(cache_key, formatted_data, ttl=300)
                return formatted_data
    except Exception:
        pass
    
    # Fallback CoinGecko
    coin_map = {
        "BTCUSDT_PERP.A": "bitcoin",
        "ETHUSDT_PERP.A": "ethereum",
        "SOLUSDT_PERP.A": "solana"
    }
    
    coin_id = coin_map.get(symbols, "bitcoin")
    coingecko_url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart/range"
    
    try:
        params = {
            "vs_currency": "usd",
            "from": from_time,
            "to": to_time
        }
        
        response = requests.get(coingecko_url, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            
            if "prices" in data:
                formatted_data = []
                for price_point in data["prices"]:
                    formatted_data.append({
                        "t": price_point[0] // 1000,
                        "c": price_point[1]
                    })
                
                cache.set(cache_key, formatted_data, ttl=300)
                return formatted_data
    except Exception:
        pass
    
    return []


@router.get("/prices/latest")
async def get_latest_price(
    symbol: str = Query(..., description="Símbolo (ex: BTC)"),
    exchange: Optional[str] = Query(None, description="Exchange específica"),
    db: Session = Depends(get_db),
    current_key: str = Depends(get_current_api_key)
):
    """Obtém o preço mais recente de um símbolo"""
    from backend.database import get_latest_price as db_latest_price
    
    price = db_latest_price(db, symbol, exchange)
    
    if price:
        return price.to_dict()
    
    # Tenta obter da Binance se não houver no DB
    try:
        binance_symbol = f"{symbol}USDT"
        url = "https://api.binance.com/api/v3/ticker/price"
        params = {"symbol": binance_symbol}
        
        response = requests.get(url, params=params, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            
            # Salva no banco
            from backend.database import create_price
            price_record = create_price(
                db=db,
                symbol=symbol,
                exchange="binance",
                price=float(data["price"])
            )
            
            return {
                "symbol": symbol,
                "exchange": "binance",
                "price": float(data["price"]),
                "timestamp": datetime.utcnow().isoformat()
            }
    except Exception:
        pass
    
    raise HTTPException(status_code=404, detail="Preço não encontrado")


# ==================== EXCHANGES ====================

@router.get("/exchanges")
async def get_exchanges(
    current_key: str = Depends(get_current_api_key)
):
    """
    Lista todas as exchanges suportadas.
    """
    return {
        "exchanges": [
            {
                "id": "binance",
                "name": "Binance",
                "status": "active",
                "api_status": "online",
                "url": "https://www.binance.com",
                "docs_url": "https://binance-docs.github.io/apidocs",
                "websocket_url": "wss://stream.binance.com:9443"
            },
            {
                "id": "bybit",
                "name": "Bybit",
                "status": "active",
                "api_status": "online",
                "url": "https://www.bybit.com",
                "docs_url": "https://bybit-exchange.github.io/docs",
                "websocket_url": "wss://stream.bybit.com/v5/public"
            },
            {
                "id": "okx",
                "name": "OKX",
                "status": "active",
                "api_status": "online",
                "url": "https://www.okx.com",
                "docs_url": "https://www.okx.com/docs-v5",
                "websocket_url": "wss://ws.okx.com:8443/ws/v5/public"
            },
            {
                "id": "huobi",
                "name": "Huobi",
                "status": "active",
                "api_status": "online",
                "url": "https://www.huobi.com",
                "docs_url": "https://huobiapi.github.io/docs",
                "websocket_url": "wss://api.huobi.pro/ws"
            },
            {
                "id": "gate",
                "name": "Gate.io",
                "status": "active",
                "api_status": "online",
                "url": "https://www.gate.io",
                "docs_url": "https://www.gate.io/docs",
                "websocket_url": "wss://api.gate.io/ws/v4"
            },
            {
                "id": "kucoin",
                "name": "KuCoin",
                "status": "active",
                "api_status": "online",
                "url": "https://www.kucoin.com",
                "docs_url": "https://docs.kucoin.com",
                "websocket_url": "wss://push-private.kucoin.com/realtime"
            }
        ]
    }


@router.get("/exchanges/{exchange_id}")
async def get_exchange(
    exchange_id: str,
    current_key: str = Depends(get_current_api_key)
):
    """Obtém detalhes de uma exchange específica"""
    exchanges = [
        {"id": "binance", "name": "Binance", "url": "https://www.binance.com"},
        {"id": "bybit", "name": "Bybit", "url": "https://www.bybit.com"},
        {"id": "okx", "name": "OKX", "url": "https://www.okx.com"},
        {"id": "huobi", "name": "Huobi", "url": "https://www.huobi.com"},
        {"id": "gate", "name": "Gate.io", "url": "https://www.gate.io"},
        {"id": "kucoin", "name": "KuCoin", "url": "https://www.kucoin.com"}
    ]
    
    exchange = next((e for e in exchanges if e["id"] == exchange_id.lower()), None)
    if not exchange:
        raise HTTPException(status_code=404, detail="Exchange não encontrada")
    
    return exchange


# ==================== SYMBOLS ====================

@router.get("/symbols")
async def get_symbols(
    exchange: Optional[str] = Query(None, description="Filtrar por exchange"),
    current_key: str = Depends(get_current_api_key)
):
    """
    Lista todos os símbolos disponíveis.
    """
    symbols = [
        {"symbol": "BTC", "name": "Bitcoin", "exchanges": ["binance", "bybit", "okx"]},
        {"symbol": "ETH", "name": "Ethereum", "exchanges": ["binance", "bybit", "okx"]},
        {"symbol": "BNB", "name": "BNB", "exchanges": ["binance"]},
        {"symbol": "SOL", "name": "Solana", "exchanges": ["binance", "bybit", "okx"]},
        {"symbol": "XRP", "name": "XRP", "exchanges": ["binance", "bybit", "okx"]},
        {"symbol": "ADA", "name": "Cardano", "exchanges": ["binance", "bybit"]},
        {"symbol": "DOGE", "name": "Dogecoin", "exchanges": ["binance", "bybit"]},
        {"symbol": "AVAX", "name": "Avalanche", "exchanges": ["binance", "bybit"]},
        {"symbol": "DOT", "name": "Polkadot", "exchanges": ["binance", "bybit"]},
        {"symbol": "MATIC", "name": "Polygon", "exchanges": ["binance", "bybit"]},
        {"symbol": "LINK", "name": "Chainlink", "exchanges": ["binance", "bybit"]},
        {"symbol": "UNI", "name": "Uniswap", "exchanges": ["binance"]},
        {"symbol": "ATOM", "name": "Cosmos", "exchanges": ["binance"]},
        {"symbol": "LTC", "name": "Litecoin", "exchanges": ["binance", "bybit"]}
    ]
    
    if exchange:
        symbols = [s for s in symbols if exchange.lower() in s["exchanges"]]
    
    return {"symbols": symbols}


# ==================== SETTINGS - API KEY VALIDATION ====================

class ValidateAPIKeyRequest(BaseModel):
    """Modelo para requisição de validação de API key"""
    api_key: str
    provider: str  # 'coinapi' ou 'coinalyze'


@router.post("/settings/validate-api-key")
async def validate_api_key(
    request: ValidateAPIKeyRequest,
    current_key: str = Depends(get_current_api_key)
):
    """
    Valida uma chave de API externa (CoinAPI ou Coinalyze).
    
    Args:
        api_key: A chave de API a ser validada
        provider: O provedor ('coinapi' ou 'coinalyze')
    
    Returns:
        JSON com {valid: bool, message: str}
    """
    api_key = request.api_key.strip()
    provider = request.provider.lower().strip()
    
    if not api_key:
        return {"valid": False, "message": "API key não pode estar vazia"}
    
    if provider not in ["coinapi", "coinalyze"]:
        return {"valid": False, "message": "Provedor inválido. Use 'coinapi' ou 'coinalyze'"}
    
    timeout = httpx.Timeout(10.0, connect=10.0)
    
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if provider == "coinapi":
                # Valida CoinAPI fazendo request para taxa de câmbio
                response = await client.get(
                    "https://rest.coinapi.io/v1/exchangerate/BTC/USD",
                    headers={"X-CoinAPI-Key": api_key}
                )
            else:
                # Valida Coinalyze fazendo request para histórico de liquidações
                end_time = datetime.now()
                start_time = end_time - timedelta(days=7)
                
                response = await client.get(
                    "https://api.coinalyze.net/v1/liquidation-history",
                    params={
                        "api_key": api_key,
                        "symbols": "BTC",
                        "interval": "daily",
                        "from": int(start_time.timestamp()),
                        "to": int(end_time.timestamp())
                    }
                )
            
            # Verifica se a resposta está no range de sucesso (200-299)
            if 200 <= response.status_code < 300:
                # Salva a chave validada
                save_api_key(provider, api_key)
                return {"valid": True, "message": "API key válida e salva nas configurações"}
            elif response.status_code == 401:
                return {"valid": False, "message": "API key inválida ou não autorizada"}
            elif response.status_code == 429:
                return {"valid": False, "message": "Limite de requisições excedido"}
            else:
                return {
                    "valid": False, 
                    "message": f"Erro do provedor (HTTP {response.status_code})"
                }
                
    except httpx.TimeoutException:
        return {"valid": False, "message": "Tempo limite excedido (timeout)"}
    except httpx.RequestError as e:
        return {"valid": False, "message": f"Erro de conexão: {str(e)}"}
    except Exception as e:
        logger.exception("Erro ao validar API key")
        return {"valid": False, "message": f"Erro interno: {str(e)}"}


# ==================== HEALTH CHECK ====================

@router.get("/health")
async def health_check():
    """Endpoint de verificação de saúde"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": settings.APP_VERSION
    }


# ==================== ROTA DE COMPATIBILIDADE - FLASK (PORTA 5000) ====================
# Rotas para compatibilidade com arquivos HTML originais que tentam conectar
# no servidor Flask antigo (127.0.0.1:5000)

# Router sem autenticação para rotas de compatibilidade
compat_router = APIRouter(prefix="", tags=["Compatibilidade"])


@compat_router.get("/api/liquidation-history")
async def compat_liquidation_history(
    symbols: str = Query(..., description="Símbolos separados por vírgula"),
    interval: str = Query("daily", description="Intervalo: daily, hourly"),
    from_time: int = Query(..., alias="from", description="Timestamp Unix de início"),
    to_time: int = Query(..., alias="to", description="Timestamp Unix de fim"),
    amount_min: Optional[float] = Query(None, description="Valor mínimo de liquidação em USD"),
    amount_max: Optional[float] = Query(None, description="Valor máximo de liquidação em USD"),
    api_key: str = Query("FREE", description="API Key Coinalyze")
):
    """
    Rota de compatibilidade:GET /api/liquidation-history
    
    Replica o endpoint original do Flask proxy_server.py para que os arquivos
    HTML originais continuem funcionando com o novo backend FastAPI.
    
    Parâmetros:
    - symbols: Símbolos separados por vírgula (ex: BTC,ETH)
    - interval: Intervalo (daily, hourly)
    - from: Timestamp Unix de início
    - to: Timestamp Unix de fim
    - api_key: API Key da Coinalyze
    """
    # Constrói chave de cache
    cache_key = f"compat_liquidation:{symbols}:{interval}:{from_time}:{to_time}"
    
    # Tenta cache
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data
    
    # Chama API Coinalyze
    coinalyze_url = "https://api.coinalyze.net/v1/liquidation-history"
    params = {
        "symbols": symbols,
        "interval": interval,
        "api_key": settings.COINALYZE_API_KEY,
        "from": from_time,
        "to": to_time
    }
    
    try:
        response = requests.get(coinalyze_url, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            
            # A API Coinalyze pode retornar objeto ou array
            # Se for objeto, tenta extrair o campo 'data' ou usa os valores
            if isinstance(data, dict):
                # Tenta encontrar o array de dados
                if 'data' in data:
                    result = data['data']
                elif 'results' in data:
                    result = data['results']
                else:
                    # Se não encontrar campo conhecido, retorna as chaves como lista
                    result = list(data.values()) if data else []
                    # Filtra para manter apenas listas
                    result = [item for item in result if isinstance(item, list)]
                    result = result[0] if result else []
            else:
                result = data
            
            # Filtrar por amount_min e amount_max após receber os dados da API
            if amount_min is not None or amount_max is not None:
                filtered_result = []
                for item in result:
                    value_usd = item.get('value_usd', 0)
                    if amount_min is not None and value_usd < amount_min:
                        continue
                    if amount_max is not None and value_usd > amount_max:
                        continue
                    filtered_result.append(item)
                result = filtered_result
            
            # Salva no cache por 5 minutos
            cache.set(cache_key, result, ttl=300)
            
            return result
        else:
            return {
                "error": f"Coinalyze API returned {response.status_code}",
                "message": response.text
            }
    except Exception as e:
        return {
            "error": "Proxy error",
            "message": str(e)
        }, 500


@compat_router.get("/api/price-history")
async def compat_price_history(
    symbols: str = Query(..., description="Símbolo (ex: BTCUSDT_PERP.A)"),
    interval: str = Query("1d", description="Intervalo"),
    from_time: int = Query(..., alias="from", description="Timestamp Unix de início"),
    to_time: int = Query(..., alias="to", description="Timestamp Unix de fim"),
    api_key: Optional[str] = Query(None, description="API Key (não usado, para compatibilidade)")
):
    """
    Rota de compatibilidade: GET /api/price-history
    
    Replica o endpoint original do Flask proxy_server.py para que os arquivos
    HTML originais continuem funcionando com o novo backend FastAPI.
    
    Parâmetros:
    - symbol: Símbolo (ex: BTCUSDT_PERP.A)
    - interval: Intervalo (não usado, mantido para compatibilidade)
    - from: Timestamp Unix de início
    - to: Timestamp Unix de fim
    
    Tenta: Binance -> GeckoTerminal -> CoinGecko
    """
    # Constrói chave de cache
    cache_key = f"compat_price:{symbols}:{from_time}:{to_time}"
    
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data
    
    # Converte símbolo
    symbol_map = {
        "BTCUSDT_PERP.A": "BTCUSDT",
        "ETHUSDT_PERP.A": "ETHUSDT",
        "SOLUSDT_PERP.A": "SOLUSDT",
        "XRPUSDT_PERP.A": "XRPUSDT",
        "ADAUSDT_PERP.A": "ADAUSDT"
    }
    
    binance_symbol = symbol_map.get(symbols, "BTCUSDT")
    days_range = (to_time - from_time) / (24 * 60 * 60)
    
    # Tenta Binance
    try:
        binance_url = "https://api.binance.com/api/v3/klines"
        params = {
            "symbol": binance_symbol,
            "interval": "1d",
            "startTime": from_time * 1000,
            "endTime": to_time * 1000,
            "limit": 1000
        }
        
        response = requests.get(binance_url, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            
            if isinstance(data, list) and len(data) > 0:
                formatted_data = []
                for item in data:
                    formatted_data.append({
                        "t": item[0] // 1000,
                        "c": item[4]
                    })
                
                cache.set(cache_key, formatted_data, ttl=300)
                return formatted_data
    except Exception:
        pass
    
    # Fallback CoinGecko
    coin_map = {
        "BTCUSDT_PERP.A": "bitcoin",
        "ETHUSDT_PERP.A": "ethereum",
        "SOLUSDT_PERP.A": "solana",
        "XRPUSDT_PERP.A": "ripple",
        "ADAUSDT_PERP.A": "cardano"
    }
    
    coin_id = coin_map.get(symbols, "bitcoin")
    coingecko_url = f"https://api.coingecko.com/api/v3/coins/{coin_id}/market_chart/range"
    
    try:
        params = {
            "vs_currency": "usd",
            "from": from_time,
            "to": to_time
        }
        
        response = requests.get(coingecko_url, params=params, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            
            if "prices" in data:
                formatted_data = []
                for price_point in data["prices"]:
                    formatted_data.append({
                        "t": price_point[0] // 1000,
                        "c": price_point[1]
                    })
                
                cache.set(cache_key, formatted_data, ttl=300)
                return formatted_data
    except Exception:
        pass
    
    return []
