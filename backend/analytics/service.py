"""
Serviço de Análises e Estatísticas
Fornece estatísticas avançadas e indicadores técnicos.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from collections import defaultdict
import statistics

from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from backend.database import get_liquidations, get_prices, get_liquidation_stats


class AnalyticsService:
    """
    Serviço de análises estatísticas para dados de mercado.
    """
    
    @staticmethod
    def calculate_moving_average(
        prices: List[float],
        period: int
    ) -> Optional[float]:
        """
        Calcula média móvel simples (SMA).
        
        Args:
            prices: Lista de preços
            period: Período da média móvel
            
        Returns:
            Média móvel ou None se dados insuficientes
        """
        if len(prices) < period:
            return None
        
        return sum(prices[-period:]) / period
    
    @staticmethod
    def calculate_ema(
        prices: List[float],
        period: int
    ) -> Optional[float]:
        """
        Calcula média móvel exponencial (EMA).
        
        Args:
            prices: Lista de preços
            period: Período da EMA
            
        Returns:
            EMA ou None se dados insuficientes
        """
        if len(prices) < period:
            return None
        
        multiplier = 2 / (period + 1)
        ema = prices[0]
        
        for price in prices[1:]:
            ema = (price * multiplier) + (ema * (1 - multiplier))
        
        return ema
    
    @staticmethod
    def calculate_rsi(
        prices: List[float],
        period: int = 14
    ) -> Optional[float]:
        """
        Calcula Relative Strength Index (RSI).
        
        Args:
            prices: Lista de preços
            period: Período do RSI (default 14)
            
        Returns:
            RSI (0-100) ou None
        """
        if len(prices) < period + 1:
            return None
        
        gains = []
        losses = []
        
        for i in range(1, len(prices)):
            change = prices[i] - prices[i-1]
            if change > 0:
                gains.append(change)
                losses.append(0)
            else:
                gains.append(0)
                losses.append(abs(change))
        
        if len(gains) < period:
            return None
        
        avg_gain = sum(gains[-period:]) / period
        avg_loss = sum(losses[-period:]) / period
        
        if avg_loss == 0:
            return 100
        
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        
        return round(rsi, 2)
    
    @staticmethod
    def calculate_volatility(
        prices: List[float]
    ) -> Optional[float]:
        """
        Calcula volatilidade (desvio padrão).
        
        Args:
            prices: Lista de preços
            
        Returns:
            Desvio padrão ou None
        """
        if len(prices) < 2:
            return None
        
        return statistics.stdev(prices)
    
    @staticmethod
    def detect_trend(
        prices: List[float],
        threshold: float = 0.02
    ) -> str:
        """
        Detecta tendência com base em médias móveis.
        
        Args:
            prices: Lista de preços
            threshold: Limiar para detecção (2% default)
            
        Returns:
            "bullish", "bearish" ou "neutral"
        """
        if len(prices) < 20:
            return "neutral"
        
        ma_short = AnalyticsService.calculate_moving_average(prices, 5)
        ma_long = AnalyticsService.calculate_moving_average(prices, 20)
        
        if not ma_short or not ma_long:
            return "neutral"
        
        pct_diff = (ma_short - ma_long) / ma_long
        
        if pct_diff > threshold:
            return "bullish"
        elif pct_diff < -threshold:
            return "bearish"
        
        return "neutral"


def get_liquidation_analytics(
    db: Session,
    symbol: Optional[str] = None,
    exchange: Optional[str] = None,
    days: int = 30
) -> Dict[str, Any]:
    """
    Obtém análises completas de liquidações.
    
    Args:
        db: Sessão do banco
        symbol: Símbolo específico
        exchange: Exchange específica
        days: Período em dias
        
    Returns:
        Dicionário com análises
    """
    start_time = datetime.utcnow() - timedelta(days=days)
    end_time = datetime.utcnow()
    
    # Obtém dados do banco
    liquidations = get_liquidations(
        db=db,
        symbol=symbol,
        exchange=exchange,
        start_time=start_time,
        end_time=end_time,
        limit=10000
    )
    
    if not liquidations:
        return {
            "message": "No liquidation data found",
            "period_days": days
        }
    
    # Estatísticas básicas
    total_count = len(liquidations)
    total_volume = sum(l.value_usd or 0 for l in liquidations)
    avg_volume = total_volume / total_count if total_count > 0 else 0
    
    # Por tipo (long/short)
    long_liquidations = [l for l in liquidations if l.side == "long"]
    short_liquidations = [l for l in liquidations if l.side == "short"]
    
    # Por exchange
    by_exchange = defaultdict(lambda: {"count": 0, "volume": 0})
    for l in liquidations:
        by_exchange[l.exchange]["count"] += 1
        by_exchange[l.exchange]["volume"] += l.value_usd or 0
    
    # Por símbolo
    by_symbol = defaultdict(lambda: {"count": 0, "volume": 0})
    for l in liquidations:
        by_symbol[l.symbol]["count"] += 1
        by_symbol[l.symbol]["volume"] += l.value_usd or 0
    
    # Análise temporal
    by_day = defaultdict(lambda: {"long": 0, "short": 0, "volume": 0})
    for l in liquidations:
        day = l.timestamp.strftime("%Y-%m-%d")
        if l.side == "long":
            by_day[day]["long"] += 1
        elif l.side == "short":
            by_day[day]["short"] += 1
        by_day[day]["volume"] += l.value_usd or 0
    
    return {
        "period_days": days,
        "total_count": total_count,
        "total_volume": round(total_volume, 2),
        "avg_volume": round(avg_volume, 2),
        "max_volume": max((l.value_usd or 0 for l in liquidations), default=0),
        "long_count": len(long_liquidations),
        "short_count": len(short_liquidations),
        "long_volume": round(sum(l.value_usd or 0 for l in long_liquidations), 2),
        "short_volume": round(sum(l.value_usd or 0 for l in short_liquidations), 2),
        "by_exchange": dict(by_exchange),
        "by_symbol": dict(by_symbol),
        "by_day": dict(by_day)
    }


def get_price_analytics(
    db: Session,
    symbol: str,
    exchange: Optional[str] = None,
    days: int = 30
) -> Dict[str, Any]:
    """
    Obtém análises de preços com indicadores técnicos.
    
    Args:
        db: Sessão do banco
        symbol: Símbolo
        exchange: Exchange específica
        days: Período em dias
        
    Returns:
        Dicionário com análises e indicadores
    """
    start_time = datetime.utcnow() - timedelta(days=days)
    end_time = datetime.utcnow()
    
    prices = get_prices(
        db=db,
        symbol=symbol,
        exchange=exchange,
        start_time=start_time,
        end_time=end_time,
        limit=10000
    )
    
    if not prices:
        return {
            "message": "No price data found",
            "symbol": symbol,
            "period_days": days
        }
    
    # Extrai lista de preços
    price_list = [p.price for p in prices]
    price_list.reverse()  # Mais antigo para mais recente
    
    # Indicadores técnicos
    sma_7 = AnalyticsService.calculate_moving_average(price_list, 7)
    sma_20 = AnalyticsService.calculate_moving_average(price_list, 20)
    sma_50 = AnalyticsService.calculate_moving_average(price_list, 50)
    
    ema_12 = AnalyticsService.calculate_ema(price_list, 12)
    ema_26 = AnalyticsService.calculate_ema(price_list, 26)
    
    rsi = AnalyticsService.calculate_rsi(price_list)
    volatility = AnalyticsService.calculate_volatility(price_list)
    trend = AnalyticsService.detect_trend(price_list)
    
    # Estatísticas
    current_price = prices[0].price if prices else 0
    high_price = max(price_list)
    low_price = min(price_list)
    avg_price = statistics.mean(price_list)
    
    return {
        "symbol": symbol,
        "exchange": exchange or "all",
        "period_days": days,
        "current_price": current_price,
        "high_price": high_price,
        "low_price": low_price,
        "avg_price": avg_price,
        "price_range": high_price - low_price,
        "indicators": {
            "sma_7": round(sma_7, 2) if sma_7 else None,
            "sma_20": round(sma_20, 2) if sma_20 else None,
            "sma_50": round(sma_50, 2) if sma_50 else None,
            "ema_12": round(ema_12, 2) if ema_12 else None,
            "ema_26": round(ema_26, 2) if ema_26 else None,
            "rsi_14": rsi,
            "volatility": round(volatility, 4) if volatility else None,
            "trend": trend
        },
        "price_count": len(price_list)
    }


def get_multi_exchange_analytics(
    db: Session,
    symbol: str,
    days: int = 30
) -> Dict[str, Any]:
    """
    Obtém análise agregada de múltiplas exchanges.
    
    Args:
        db: Sessão do banco
        symbol: Símbolo
        days: Período em dias
        
    Returns:
        Análise comparativa entre exchanges
    """
    exchanges = ["binance", "bybit", "okx", "huobi"]
    results = {}
    
    for exchange in exchanges:
        prices = get_prices(
            db=db,
            symbol=symbol,
            exchange=exchange,
            limit=100
        )
        
        if prices:
            price_values = [p.price for p in prices]
            results[exchange] = {
                "latest_price": prices[0].price,
                "avg_price": statistics.mean(price_values),
                "high_24h": max(price_values),
                "low_24h": min(price_values),
                "sample_count": len(price_values)
            }
    
    return {
        "symbol": symbol,
        "period_days": days,
        "exchanges": results
    }
