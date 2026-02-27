"""
Schemas Pydantic para validação e serialização de dados da API.
"""

from typing import Generic, TypeVar, List, Optional
from pydantic import BaseModel

T = TypeVar('T')


class PaginatedResponse(BaseModel, Generic[T]):
    """
    Modelo de resposta paginada.
    
    Args:
        data: Lista de itens da página atual
        total: Total de itens disponíveis
        page: Número da página atual
        page_size: Quantidade de itens por página
    """
    data: List[T]
    total: int
    page: int = 1
    page_size: int = 20


class LiquidationSchema(BaseModel):
    """Schema para dados de liquidação"""
    id: str
    timestamp: int
    amount: float
    exchange: str
    side: str
    price: float
    symbol: str
    long_liquidation: float = 0
    short_liquidation: float = 0


class PriceSchema(BaseModel):
    """Schema para dados de preço"""
    symbol: str
    price: float
    timestamp: int


class ExchangeSchema(BaseModel):
    """Schema para dados de exchange"""
    id: str
    name: str
    status: str
