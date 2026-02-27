"""
FastAPI Main Application
Ponto de entrada principal do backend Coinglass.
"""

import logging
from contextlib import asynccontextmanager
from datetime import datetime
import json
from fastapi import FastAPI, WebSocket, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
import os

from backend.config import settings
from backend.database import init_db
from backend.api import router, compat_router
from backend.websocket import (
    ws_manager,
    websocket_endpoint_liquidation,
    websocket_endpoint_price
)
from backend.analytics import get_liquidation_analytics, get_price_analytics
from backend.auth import get_current_api_key
from sqlalchemy.orm import Session
from backend.database import get_db

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager para startup e shutdown.
    """
    # Startup
    logger.info(f"Iniciando {settings.APP_NAME} v{settings.APP_VERSION}")
    
    # Inicializa banco de dados
    init_db()
    logger.info("Banco de dados inicializado")
    
    yield
    
    # Shutdown
    logger.info("Encerrando aplicação...")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    description="""
    Backend API para dados de cryptomoedas.
    
    ## Funcionalidades
    - **Liquidações**: Histórico de liquidações de contratos futuros
    - **Preços**: Dados históricos de preços de múltiplas exchanges
    - **Análises**: Estatísticas e indicadores técnicos
    - **WebSocket**: Streaming em tempo real
    - **Alertas**: Sistema de notificações
    
    ## Autenticação
    Use o header `X-API-Key` para autenticação.
    """,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== PÁGINA PRINCIPAL ====================

@app.get("/", response_class=HTMLResponse)
async def root():
    """Página inicial do Coinglass"""
    html_content = """
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Coinglass - Dashboard</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); min-height: 100vh; color: white; }
            .container { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
            h1 { font-size: 2.5rem; margin-bottom: 10px; }
            .subtitle { color: #888; margin-bottom: 40px; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
            .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 24px; transition: transform 0.2s, box-shadow 0.2s; text-decoration: none; display: block; }
            .card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(0,0,0,0.3); }
            .card h2 { margin: 0 0 10px 0; font-size: 1.3rem; color: #4ade80; }
            .card p { margin: 0; color: #aaa; font-size: 0.9rem; }
            .badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; margin-bottom: 12px; }
            .badge-blue { background: #3b82f6; }
            .badge-green { background: #10b981; }
            .badge-purple { background: #8b5cf6; }
            .badge-orange { background: #f59e0b; }
            footer { text-align: center; margin-top: 60px; color: #666; font-size: 0.85rem; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🪙 Coinglass</h1>
            <p class="subtitle">Dashboard de Análise de Criptomoedas</p>
            
            <div class="grid">
                <a href="/docs" class="card">
                    <span class="badge badge-blue">API</span>
                    <h2>📚 Documentação API</h2>
                    <p>Explore todos os endpoints disponíveis com Swagger UI</p>
                </a>
                
                <a href="/coinalyze_test.html" class="card">
                    <span class="badge badge-green">Teste</span>
                    <h2>📊 Teste de Liquidações</h2>
                    <p>Interface para testar dados de liquidações via Coinalyze</p>
                </a>
                
                <a href="/coinapi_test.html" class="card">
                    <span class="badge badge-purple">Teste</span>
                    <h2>💰 Teste de Preços</h2>
                    <p>Interface para testar dados de preços via CoinAPI</p>
                </a>
                
                <a href="/frontend/index.html" class="card">
                    <span class="badge badge-orange">Novo</span>
                    <h2>🎨 Dashboard React</h2>
                    <p>Nova interface moderna com gráficos e indicadores técnicos</p>
                </a>
            </div>
            
            <footer>
                <p>Coinglass v1.0.0 | Dados fornecidos por Binance, CoinGecko, CoinAPI e Coinalyze</p>
            </footer>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)


# ==================== ARQUIVOS ESTÁTICOS ====================

@app.get("/coinalyze_test.html")
async def coinalyze_test():
    """Serve o arquivo de teste da Coinalyze"""
    return FileResponse("coinalyze_test.html")

@app.get("/coinapi_test.html")
async def coinapi_test():
    """Serve o arquivo de teste da CoinAPI"""
    return FileResponse("coinapi_test.html")


# ==================== ROUTES ====================

# API Routes
app.include_router(router)

# Routes de compatibilidade (sem autenticação)
app.include_router(compat_router)


# ==================== WEBSOCKETS ====================

@app.websocket("/ws")
async def websocket_main(websocket: WebSocket):
    """
    WebSocket principal - aceita subscribe para múltiplos streams.
    
    Uso:
    - Conectar em ws://host/ws
    - Enviar mensagem de subscribe: {"action": "subscribe", "streams": ["liquidation", "price"]}
    """
    from backend.websocket import ws_manager
    from fastapi import WebSocketDisconnect
    
    await websocket.accept()
    
    # Cliente pode se conectar a múltiplos streams
    subscriptions = set()
    
    try:
        # Envia mensagem de boas-vindas
        await websocket.send_json({
            "type": "connected",
            "streams": ["liquidation", "price"],
            "message": "Conectado ao WebSocket Coinglass. Use {\"action\": \"subscribe\", \"streams\": [\"liquidation\", \"price\"]} para escolher streams.",
            "timestamp": datetime.utcnow().isoformat()
        })
        
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                
                if message.get("action") == "subscribe":
                    # Aceita "stream" (singular) ou "streams" (plural)
                    streams = message.get("streams", [])
                    if not streams and message.get("stream"):
                        streams = [message.get("stream")]
                        
                    for stream in streams:
                        if stream in ["liquidation", "price"]:
                            if stream not in subscriptions:
                                await ws_manager.connect(websocket, stream, accept_connection=False)
                                subscriptions.add(stream)
                                
                    await websocket.send_json({
                        "type": "subscribed",
                        "streams": list(subscriptions)
                    })
                elif message.get("action") == "unsubscribe":
                    streams = message.get("streams", [])
                    if not streams and message.get("stream"):
                        streams = [message.get("stream")]
                        
                    for stream in streams:
                        if stream in subscriptions:
                            ws_manager.disconnect(websocket, stream)
                            subscriptions.discard(stream)
                            
                    await websocket.send_json({
                        "type": "unsubscribed",
                        "streams": list(subscriptions)
                    })
                    
            except json.JSONDecodeError:
                pass
                
    except WebSocketDisconnect:
        ws_manager.disconnect_from_all(websocket)
    except Exception as e:
        logger.error(f"Erro na conexão WebSocket /ws: {e}")
        ws_manager.disconnect_from_all(websocket)



@app.websocket("/ws/liquidation")
async def websocket_liquidation(websocket: WebSocket):
    """WebSocket para stream de liquidações em tempo real"""
    await websocket_endpoint_liquidation(websocket)


@app.websocket("/ws/price")
async def websocket_price(websocket: WebSocket):
    """WebSocket para stream de preços em tempo real"""
    await websocket_endpoint_price(websocket)


# ==================== ANALYTICS ====================

@app.get("/api/v1/analytics/liquidations")
async def analytics_liquidations(
    symbol: str = None,
    exchange: str = None,
    days: int = 30,
    db: Session = Depends(get_db),
    current_key: str = Depends(get_current_api_key)
):
    """Análises estatísticas de liquidações"""
    return get_liquidation_analytics(db, symbol, exchange, days)


@app.get("/api/v1/analytics/prices")
async def analytics_prices(
    symbol: str,
    exchange: str = None,
    days: int = 30,
    db: Session = Depends(get_db),
    current_key: str = Depends(get_current_api_key)
):
    """Análises de preços com indicadores técnicos"""
    return get_price_analytics(db, symbol, exchange, days)


# ==================== ALERTS ====================

@app.get("/api/v1/alerts")
async def list_alerts(
    symbol: str = None,
    is_active: bool = None,
    db: Session = Depends(get_db),
    current_key: str = Depends(get_current_api_key)
):
    """Lista todos os alertas"""
    from backend.database import get_alerts
    
    alerts = get_alerts(db, symbol=symbol, is_active=is_active)
    
    return {
        "alerts": [a.to_dict() for a in alerts],
        "count": len(alerts)
    }


@app.post("/api/v1/alerts")
async def create_alert(
    name: str,
    symbol: str,
    threshold_usd: float,
    exchange: str = None,
    notification_type: str = "log",
    notification_config: str = None,
    db: Session = Depends(get_db),
    current_key: str = Depends(get_current_api_key)
):
    """Cria um novo alerta"""
    from backend.alerts import create_new_alert
    
    alert = create_new_alert(
        db=db,
        name=name,
        symbol=symbol,
        threshold_usd=threshold_usd,
        exchange=exchange,
        notification_type=notification_type,
        notification_config=notification_config
    )
    
    return {
        "message": "Alerta criado com sucesso",
        "alert": alert.to_dict()
    }


@app.delete("/api/v1/alerts/{alert_id}")
async def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_key: str = Depends(get_current_api_key)
):
    """Deleta um alerta"""
    from backend.database import delete_alert
    
    success = delete_alert(db, alert_id)
    
    if success:
        return {"message": "Alerta deletado com sucesso"}
    else:
        return JSONResponse(
            status_code=404,
            content={"error": "Alerta não encontrado"}
        )


# ==================== WEBSOCKET STATUS ====================

@app.get("/api/v1/ws/status")
async def ws_status():
    """Retorna status das conexões WebSocket"""
    return ws_manager.get_total_connections()


# ==================== HEALTH ====================

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "database": "connected"
    }


# ==================== ROOT ====================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "endpoints": {
            "liquidations": "/api/v1/liquidations",
            "prices": "/api/v1/prices",
            "exchanges": "/api/v1/exchanges",
            "symbols": "/api/v1/symbols",
            "analytics": "/api/v1/analytics",
            "alerts": "/api/v1/alerts",
            "ws_liquidation": "/ws/liquidation",
            "ws_price": "/ws/price"
        }
    }


# Run server
if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "backend.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
