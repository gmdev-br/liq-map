"""
Modelos de Banco de Dados SQLAlchemy
Define as tabelas e estruturas de dados para persistência.
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import (
    create_engine, 
    Column, 
    Integer, 
    String, 
    Float, 
    DateTime, 
    Boolean, 
    Text,
    Index,
    ForeignKey
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

from backend.config import settings

# Base declarativa
Base = declarative_base()


class Liquidation(Base):
    """
    Modelo para dados de liquidação.
    Armazena informações sobre liquidações de contratos futuros.
    """
    __tablename__ = "liquidations"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Identificação única da liquidação (da API externa)
    liquidation_id = Column(String(255), unique=True, nullable=False, index=True)
    
    # Exchange onde ocorreu a liquidação
    exchange = Column(String(50), nullable=False, index=True)
    
    # Símbolo do ativo (BTC, ETH, etc.)
    symbol = Column(String(20), nullable=False, index=True)
    
    # Par de trading (BTCUSDT, etc.)
    pair = Column(String(20), nullable=False)
    
    # Preço da liquidação
    price = Column(Float, nullable=False)
    
    # Quantidade liquidada
    quantity = Column(Float, nullable=False)
    
    # Valor total em USD
    value_usd = Column(Float)
    
    # Tipo de liquidação (long ou short)
    side = Column(String(10))  # "long" ou "short"
    
    # Timestamp da liquidação
    timestamp = Column(DateTime, nullable=False, index=True)
    
    # Created at
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    alerts = relationship("Alert", back_populates="liquidation", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Liquidation {self.liquidation_id} {self.symbol} {self.side} ${self.value_usd:.2f}>"
    
    def to_dict(self):
        """Converte para dicionário"""
        return {
            "id": self.id,
            "liquidation_id": self.liquidation_id,
            "exchange": self.exchange,
            "symbol": self.symbol,
            "pair": self.pair,
            "price": self.price,
            "quantity": self.quantity,
            "value_usd": self.value_usd,
            "side": self.side,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class Price(Base):
    """
    Modelo para dados de preços.
    Armazena preços históricos de ativos.
    """
    __tablename__ = "prices"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Símbolo do ativo
    symbol = Column(String(20), nullable=False, index=True)
    
    # Exchange
    exchange = Column(String(50), nullable=False, index=True)
    
    # Preço
    price = Column(Float, nullable=False)
    
    # Volume (opcional)
    volume = Column(Float)
    
    # Timestamp do preço
    timestamp = Column(DateTime, nullable=False, index=True)
    
    # Created at
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Índices compostos
    __table_args__ = (
        Index('idx_symbol_exchange_timestamp', 'symbol', 'exchange', 'timestamp'),
    )
    
    def __repr__(self):
        return f"<Price {self.symbol} ${self.price} @ {self.timestamp}>"
    
    def to_dict(self):
        """Converte para dicionário"""
        return {
            "id": self.id,
            "symbol": self.symbol,
            "exchange": self.exchange,
            "price": self.price,
            "volume": self.volume,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class Alert(Base):
    """
    Modelo para alertas de liquidação.
    Armazena configurações de alertas e histórico de triggers.
    """
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Nome do alerta
    name = Column(String(100), nullable=False)
    
    # Símbolo monitorado
    symbol = Column(String(20), nullable=False, index=True)
    
    # Threshold de valor USD para dispara alerta
    threshold_usd = Column(Float, nullable=False)
    
    # Exchange específica (opcional)
    exchange = Column(String(50), index=True)
    
    # Se o alerta está ativo
    is_active = Column(Boolean, default=True, index=True)
    
    # Tipo de notificação (telegram, email, webhook)
    notification_type = Column(String(20), default="log")  # "log", "telegram", "email", "webhook"
    
    # Configuração de notificação (webhook URL, email, etc.)
    notification_config = Column(Text)  # JSON string
    
    # Última vez que foi disparado
    last_triggered = Column(DateTime)
    
    # Contagem de vezes disparado
    trigger_count = Column(Integer, default=0)
    
    # Created at
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Foreign key para liquidação relacionada (se aplicável)
    liquidation_id = Column(Integer, ForeignKey('liquidations.id'), nullable=True)
    
    # Relationship
    liquidation = relationship("Liquidation", back_populates="alerts")
    
    def __repr__(self):
        return f"<Alert {self.name} {self.symbol} > ${self.threshold_usd}>"
    
    def to_dict(self):
        """Converte para dicionário"""
        return {
            "id": self.id,
            "name": self.name,
            "symbol": self.symbol,
            "threshold_usd": self.threshold_usd,
            "exchange": self.exchange,
            "is_active": self.is_active,
            "notification_type": self.notification_type,
            "last_triggered": self.last_triggered.isoformat() if self.last_triggered else None,
            "trigger_count": self.trigger_count,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class APIKey(Base):
    """
    Modelo para chaves de API de acesso.
    Usado para autenticação e rate limiting.
    """
    __tablename__ = "api_keys"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Chave de API
    key = Column(String(64), unique=True, nullable=False, index=True)
    
    # Nome/descrição da chave
    name = Column(String(100), nullable=False)
    
    # Usuário/proprietário da chave
    owner = Column(String(100))
    
    # Se a chave está ativa
    is_active = Column(Boolean, default=True, index=True)
    
    # Limite de requisições por minuto
    rate_limit = Column(Integer, default=100)
    
    # Lista de IPs permitidos (opcional)
    allowed_ips = Column(Text)  # JSON string
    
    # Data de expiração (opcional)
    expires_at = Column(DateTime)
    
    # Created at
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Última vez usada
    last_used = Column(DateTime)
    
    # Contagem de requisições
    request_count = Column(Integer, default=0)
    
    def __repr__(self):
        return f"<APIKey {self.name} ({self.key[:8]}...)>"
    
    def to_dict(self):
        """Converte para dicionário"""
        return {
            "id": self.id,
            "key": self.key[:8] + "...",
            "name": self.name,
            "owner": self.owner,
            "is_active": self.is_active,
            "rate_limit": self.rate_limit,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "last_used": self.last_used.isoformat() if self.last_used else None,
            "request_count": self.request_count,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


# Engine e Session
engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DATABASE_ECHO,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Inicializa o banco de dados - cria todas as tabelas"""
    Base.metadata.create_all(bind=engine)
    print("Banco de dados inicializado com sucesso!")


def get_db():
    """
    Dependência FastAPI para obter sessão do banco.
    
    Yields:
        Session: Sessão do banco de dados
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
