"""
CRUD Operations - Operações de Banco de Dados
Funções auxiliares para Create, Read, Update, Delete em cada modelo.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_, or_

from backend.database.models import Liquidation, Price, Alert, APIKey


# ==================== LIQUIDATIONS ====================

def create_liquidation(
    db: Session,
    liquidation_id: str,
    exchange: str,
    symbol: str,
    pair: str,
    price: float,
    quantity: float,
    value_usd: Optional[float] = None,
    side: Optional[str] = None,
    timestamp: Optional[datetime] = None
) -> Liquidation:
    """Cria um novo registro de liquidação"""
    liquidation = Liquidation(
        liquidation_id=liquidation_id,
        exchange=exchange,
        symbol=symbol,
        pair=pair,
        price=price,
        quantity=quantity,
        value_usd=value_usd,
        side=side,
        timestamp=timestamp or datetime.utcnow()
    )
    db.add(liquidation)
    db.commit()
    db.refresh(liquidation)
    return liquidation


def get_liquidations(
    db: Session,
    symbol: Optional[str] = None,
    exchange: Optional[str] = None,
    side: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    limit: int = 100,
    offset: int = 0
) -> List[Liquidation]:
    """Obtém lista de liquidações com filtros"""
    query = db.query(Liquidation)
    
    if symbol:
        query = query.filter(Liquidation.symbol == symbol.upper())
    if exchange:
        query = query.filter(Liquidation.exchange == exchange.lower())
    if side:
        query = query.filter(Liquidation.side == side.lower())
    if start_time:
        query = query.filter(Liquidation.timestamp >= start_time)
    if end_time:
        query = query.filter(Liquidation.timestamp <= end_time)
    
    query = query.order_by(desc(Liquidation.timestamp))
    query = query.offset(offset).limit(limit)
    
    return query.all()


def get_liquidation_by_id(db: Session, liquidation_id: str) -> Optional[Liquidation]:
    """Obtém uma liquidação pelo ID"""
    return db.query(Liquidation).filter(
        Liquidation.liquidation_id == liquidation_id
    ).first()


def get_liquidation_stats(
    db: Session,
    symbol: Optional[str] = None,
    exchange: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None
) -> Dict[str, Any]:
    """Calcula estatísticas de liquidações"""
    query = db.query(Liquidation)
    
    if symbol:
        query = query.filter(Liquidation.symbol == symbol.upper())
    if exchange:
        query = query.filter(Liquidation.exchange == exchange.lower())
    if start_time:
        query = query.filter(Liquidation.timestamp >= start_time)
    if end_time:
        query = query.filter(Liquidation.timestamp <= end_time)
    
    # Estatísticas
    stats = query.with_entities(
        func.count(Liquidation.id).label('total_count'),
        func.sum(Liquidation.value_usd).label('total_volume'),
        func.avg(Liquidation.value_usd).label('avg_volume'),
        func.max(Liquidation.value_usd).label('max_volume'),
        func.min(Liquidation.value_usd).label('min_volume'),
        func.avg(Liquidation.price).label('avg_price'),
        func.max(Liquidation.price).label('max_price'),
        func.min(Liquidation.price).label('min_price')
    ).first()
    
    # Contagem por lado (long/short)
    side_counts = query.with_entities(
        Liquidation.side,
        func.count(Liquidation.id).label('count'),
        func.sum(Liquidation.value_usd).label('volume')
    ).group_by(Liquidation.side).all()
    
    return {
        "total_count": stats.total_count or 0,
        "total_volume": float(stats.total_volume or 0),
        "avg_volume": float(stats.avg_volume or 0),
        "max_volume": float(stats.max_volume or 0),
        "min_volume": float(stats.min_volume or 0),
        "avg_price": float(stats.avg_price or 0),
        "max_price": float(stats.max_price or 0),
        "min_price": float(stats.min_price or 0),
        "by_side": [
            {"side": s.side, "count": s.count, "volume": float(s.volume or 0)}
            for s in side_counts if s.side
        ]
    }


def bulk_create_liquidations(
    db: Session,
    liquidations: List[Dict[str, Any]]
) -> int:
    """Cria múltiplas liquidações de uma vez"""
    created = 0
    for data in liquidations:
        # Verifica se já existe
        existing = get_liquidation_by_id(db, data.get("liquidation_id", ""))
        if not existing:
            create_liquidation(
                db=db,
                liquidation_id=data.get("liquidation_id", f"liq_{datetime.utcnow().timestamp()}"),
                exchange=data.get("exchange", "unknown"),
                symbol=data.get("symbol", "BTC"),
                pair=data.get("pair", ""),
                price=float(data.get("price", 0)),
                quantity=float(data.get("quantity", 0)),
                value_usd=float(data.get("value_usd", 0)),
                side=data.get("side"),
                timestamp=data.get("timestamp")
            )
            created += 1
    db.commit()
    return created


# ==================== PRICES ====================

def create_price(
    db: Session,
    symbol: str,
    exchange: str,
    price: float,
    volume: Optional[float] = None,
    timestamp: Optional[datetime] = None
) -> Price:
    """Cria um novo registro de preço"""
    price_record = Price(
        symbol=symbol.upper(),
        exchange=exchange.lower(),
        price=price,
        volume=volume,
        timestamp=timestamp or datetime.utcnow()
    )
    db.add(price_record)
    db.commit()
    db.refresh(price_record)
    return price_record


def get_prices(
    db: Session,
    symbol: Optional[str] = None,
    exchange: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    limit: int = 100,
    offset: int = 0
) -> List[Price]:
    """Obtém lista de preços com filtros"""
    query = db.query(Price)
    
    if symbol:
        query = query.filter(Price.symbol == symbol.upper())
    if exchange:
        query = query.filter(Price.exchange == exchange.lower())
    if start_time:
        query = query.filter(Price.timestamp >= start_time)
    if end_time:
        query = query.filter(Price.timestamp <= end_time)
    
    query = query.order_by(desc(Price.timestamp))
    query = query.offset(offset).limit(limit)
    
    return query.all()


def get_latest_price(
    db: Session,
    symbol: str,
    exchange: Optional[str] = None
) -> Optional[Price]:
    """Obtém o preço mais recente de um símbolo"""
    query = db.query(Price).filter(Price.symbol == symbol.upper())
    
    if exchange:
        query = query.filter(Price.exchange == exchange.lower())
    
    return query.order_by(desc(Price.timestamp)).first()


def get_price_stats(
    db: Session,
    symbol: str,
    exchange: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None
) -> Dict[str, Any]:
    """Calcula estatísticas de preços"""
    query = db.query(Price).filter(Price.symbol == symbol.upper())
    
    if exchange:
        query = query.filter(Price.exchange == exchange.lower())
    if start_time:
        query = query.filter(Price.timestamp >= start_time)
    if end_time:
        query = query.filter(Price.timestamp <= end_time)
    
    stats = query.with_entities(
        func.count(Price.id).label('count'),
        func.avg(Price.price).label('avg_price'),
        func.max(Price.price).label('max_price'),
        func.min(Price.price).label('min_price'),
        func.avg(Price.volume).label('avg_volume'),
        func.max(Price.volume).label('max_volume')
    ).first()
    
    return {
        "symbol": symbol.upper(),
        "exchange": exchange,
        "count": stats.count or 0,
        "avg_price": float(stats.avg_price or 0),
        "max_price": float(stats.max_price or 0),
        "min_price": float(stats.min_price or 0),
        "avg_volume": float(stats.avg_volume or 0),
        "max_volume": float(stats.max_volume or 0)
    }


# ==================== ALERTS ====================

def create_alert(
    db: Session,
    name: str,
    symbol: str,
    threshold_usd: float,
    exchange: Optional[str] = None,
    notification_type: str = "log",
    notification_config: Optional[str] = None
) -> Alert:
    """Cria um novo alerta"""
    alert = Alert(
        name=name,
        symbol=symbol.upper(),
        threshold_usd=threshold_usd,
        exchange=exchange.lower() if exchange else None,
        notification_type=notification_type,
        notification_config=notification_config
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def get_alerts(
    db: Session,
    symbol: Optional[str] = None,
    exchange: Optional[str] = None,
    is_active: Optional[bool] = None,
    limit: int = 100
) -> List[Alert]:
    """Obtém lista de alertas com filtros"""
    query = db.query(Alert)
    
    if symbol:
        query = query.filter(Alert.symbol == symbol.upper())
    if exchange:
        query = query.filter(Alert.exchange == exchange.lower())
    if is_active is not None:
        query = query.filter(Alert.is_active == is_active)
    
    query = query.order_by(desc(Alert.created_at))
    query = query.limit(limit)
    
    return query.all()


def get_alert_by_id(db: Session, alert_id: int) -> Optional[Alert]:
    """Obtém um alerta pelo ID"""
    return db.query(Alert).filter(Alert.id == alert_id).first()


def update_alert(
    db: Session,
    alert_id: int,
    **kwargs
) -> Optional[Alert]:
    """Atualiza um alerta"""
    alert = get_alert_by_id(db, alert_id)
    if not alert:
        return None
    
    for key, value in kwargs.items():
        if hasattr(alert, key):
            setattr(alert, key, value)
    
    db.commit()
    db.refresh(alert)
    return alert


def delete_alert(db: Session, alert_id: int) -> bool:
    """Deleta um alerta"""
    alert = get_alert_by_id(db, alert_id)
    if not alert:
        return False
    
    db.delete(alert)
    db.commit()
    return True


def trigger_alert(db: Session, alert_id: int, liquidation_id: int) -> Optional[Alert]:
    """Dispara um alerta - atualiza last_triggered e trigger_count"""
    alert = get_alert_by_id(db, alert_id)
    if not alert:
        return None
    
    alert.last_triggered = datetime.utcnow()
    alert.trigger_count += 1
    alert.liquidation_id = liquidation_id
    
    db.commit()
    db.refresh(alert)
    return alert


# ==================== API KEYS ====================

def create_api_key(
    db: Session,
    key: str,
    name: str,
    owner: Optional[str] = None,
    rate_limit: int = 100,
    expires_at: Optional[datetime] = None
) -> APIKey:
    """Cria uma nova chave de API"""
    api_key = APIKey(
        key=key,
        name=name,
        owner=owner,
        rate_limit=rate_limit,
        expires_at=expires_at
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)
    return api_key


def get_api_key(db: Session, key: str) -> Optional[APIKey]:
    """Obtém uma chave de API"""
    return db.query(APIKey).filter(APIKey.key == key).first()


def verify_api_key(db: Session, key: str) -> bool:
    """Verifica se uma chave de API é válida"""
    api_key = get_api_key(db, key)
    if not api_key:
        return False
    
    if not api_key.is_active:
        return False
    
    if api_key.expires_at and api_key.expires_at < datetime.utcnow():
        return False
    
    # Atualiza last_used e request_count
    api_key.last_used = datetime.utcnow()
    api_key.request_count += 1
    db.commit()
    
    return True


def delete_api_key(db: Session, key: str) -> bool:
    """Deleta uma chave de API"""
    api_key = get_api_key(db, key)
    if not api_key:
        return False
    
    db.delete(api_key)
    db.commit()
    return True


def get_all_api_keys(db: Session) -> List[APIKey]:
    """Obtém todas as chaves de API"""
    return db.query(APIKey).all()
