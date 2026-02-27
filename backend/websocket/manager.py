"""
Gerenciador de WebSocket
Gerencia conexões WebSocket para streaming de dados em tempo real.
"""

import asyncio
import json
import logging
from typing import Dict, Set, List, Any, Optional
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect

from backend.config import settings

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Gerenciador de conexões WebSocket.
    Mantém registro de clientes conectados e facilita broadcast.
    """
    
    def __init__(self):
        """
        Inicializa o gerenciador.
        """
        # Conexões ativas por tipo de stream
        self.active_connections: Dict[str, Set[WebSocket]] = {
            "liquidation": set(),
            "price": set()
        }
        
        # Contadores
        self.total_connections = 0
        self.total_disconnections = 0
    
    async def connect(
        self,
        websocket: WebSocket,
        stream_type: str,
        accept_connection: bool = True
    ) -> bool:
        """
        Aceita e registra uma nova conexão WebSocket.
        
        Args:
            websocket: Conexão WebSocket
            stream_type: Tipo de stream ("liquidation" ou "price")
            accept_connection: Se deve aceitar a conexão (True) ou se já foi aceita (False)
            
        Returns:
            True se conectado, False se limite excedido
        """
        if accept_connection:
            await websocket.accept()
        
        if stream_type not in self.active_connections:
            stream_type = "liquidation"  # Default
        
        # Verifica limite de conexões
        if len(self.active_connections[stream_type]) >= settings.WS_MAX_CONNECTIONS:
            await websocket.send_json({
                "error": "max_connections_exceeded",
                "message": f"Máximo de {settings.WS_MAX_CONNECTIONS} conexões permitidas"
            })
            await websocket.close()
            return False
        
        self.active_connections[stream_type].add(websocket)
        self.total_connections += 1
        
        logger.info(
            f"Nova conexão WebSocket: {stream_type} "
            f"(total: {len(self.active_connections[stream_type])})"
        )
        
        # Envia mensagem de boas-vindas
        await websocket.send_json({
            "type": "connected",
            "stream": stream_type,
            "timestamp": datetime.utcnow().isoformat(),
            "message": "Conectado ao stream de liquidações"
        })
        
        return True
    
    def disconnect(self, websocket: WebSocket, stream_type: str) -> None:
        """
        Remove uma conexão WebSocket de um stream específico.
        
        Args:
            websocket: Conexão WebSocket
            stream_type: Tipo de stream
        """
        if stream_type in self.active_connections:
            self.active_connections[stream_type].discard(websocket)
            self.total_disconnections += 1
            
            logger.info(
                f"Desconexão WebSocket: {stream_type} "
                f"(total: {len(self.active_connections[stream_type])})"
            )

    def disconnect_from_all(self, websocket: WebSocket) -> None:
        """
        Remove uma conexão WebSocket de todos os streams.
        
        Args:
            websocket: Conexão WebSocket
        """
        for stream_type in self.active_connections:
            if websocket in self.active_connections[stream_type]:
                self.active_connections[stream_type].discard(websocket)
                logger.info(f"Desconectado do stream {stream_type}")
        
        self.total_disconnections += 1
    
    async def send_personal_message(
        self,
        message: dict,
        websocket: WebSocket
    ) -> None:
        """
        Envia mensagem para um cliente específico.
        
        Args:
            message: Dados a enviar
            websocket: Conexão do cliente
        """
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Erro ao enviar mensagem pessoal: {e}")
    
    async def broadcast(
        self,
        message: dict,
        stream_type: str
    ) -> None:
        """
        Envia mensagem para todos os clientes de um stream.
        
        Args:
            message: Dados a enviar
            stream_type: Tipo de stream
        """
        if stream_type not in self.active_connections:
            return
        
        disconnected = []
        
        for connection in self.active_connections[stream_type]:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Erro ao broadcast: {e}")
                disconnected.append(connection)
        
        # Remove conexões mortas
        for ws in disconnected:
            self.disconnect(ws, stream_type)
    
    async def broadcast_liquidation(self, data: Dict[str, Any]) -> None:
        """
        Broadcast de dados de liquidação.
        
        Args:
            data: Dados da liquidação
        """
        message = {
            "type": "liquidation",
            "data": data,
            "timestamp": datetime.utcnow().isoformat()
        }
        await self.broadcast(message, "liquidation")
    
    async def broadcast_price(self, data: Dict[str, Any]) -> None:
        """
        Broadcast de dados de preço.
        
        Args:
            data: Dados do preço
        """
        message = {
            "type": "price",
            "data": data,
            "timestamp": datetime.utcnow().isoformat()
        }
        await self.broadcast(message, "price")
    
    def get_connection_count(self, stream_type: str) -> int:
        """
        Retorna número de conexões ativas.
        
        Args:
            stream_type: Tipo de stream
            
        Returns:
            Número de conexões
        """
        if stream_type in self.active_connections:
            return len(self.active_connections[stream_type])
        return 0
    
    def get_total_connections(self) -> Dict[str, int]:
        """Retorna contagem de todas as conexões"""
        return {
            "liquidation": len(self.active_connections.get("liquidation", set())),
            "price": len(self.active_connections.get("price", set())),
            "total": self.total_connections,
            "disconnections": self.total_disconnections
        }


# Instância global do gerenciador
ws_manager = ConnectionManager()


# Funções auxiliares para endpoints

async def websocket_endpoint_liquidation(websocket: WebSocket):
    """
    Endpoint WebSocket para stream de liquidações.
    
    usage: WebSocket("/ws/liquidation")
    """
    stream_type = "liquidation"
    
    connected = await ws_manager.connect(websocket, stream_type)
    if not connected:
        return
    
    try:
        while True:
            # Mantém conexão viva - pode receber mensagens do cliente
            data = await websocket.receive_text()
            
            # Processa mensagem do cliente (ex: subscribe/unsubscribe)
            try:
                message = json.loads(data)
                # Handle subscription changes if needed
            except json.JSONDecodeError:
                pass
                
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, stream_type)
    except Exception as e:
        logger.error(f"Erro na conexão WebSocket: {e}")
        ws_manager.disconnect(websocket, stream_type)


async def websocket_endpoint_price(websocket: WebSocket):
    """
    Endpoint WebSocket para stream de preços.
    
    usage: WebSocket("/ws/price")
    """
    stream_type = "price"
    
    connected = await ws_manager.connect(websocket, stream_type)
    if not connected:
        return
    
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                pass
                
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, stream_type)
    except Exception as e:
        logger.error(f"Erro na conexão WebSocket: {e}")
        ws_manager.disconnect(websocket, stream_type)


# Task para broadcasting simulado (para testes)
async def simulate_liquidation_broadcast():
    """
    Simula broadcast de liquidações para testes.
    Em produção, isso seria substituído por dados reais de WebSocket.
    """
    import random
    
    symbols = ["BTC", "ETH", "SOL", "XRP", "ADA"]
    exchanges = ["binance", "bybit", "okx"]
    sides = ["long", "short"]
    
    while True:
        await asyncio.sleep(5)  # A cada 5 segundos
        
        data = {
            "symbol": random.choice(symbols),
            "exchange": random.choice(exchanges),
            "side": random.choice(sides),
            "price": round(random.uniform(1000, 100000), 2),
            "quantity": round(random.uniform(0.1, 10), 4),
            "value_usd": round(random.uniform(1000, 500000), 2),
            "liquidation_id": f"sim_{datetime.utcnow().timestamp()}"
        }
        
        await ws_manager.broadcast_liquidation(data)
