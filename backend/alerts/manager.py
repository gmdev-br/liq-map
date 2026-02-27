"""
Sistema de Alertas
Gerencia alertas de liquidação e notificações.
"""

import json
import logging
from datetime import datetime
from typing import List, Dict, Optional, Any
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import get_alerts, create_alert, trigger_alert

# Logger
logger = logging.getLogger(__name__)


class AlertManager:
    """
    Gerenciador de alertas de liquidação.
    Verifica thresholds e dispara notificações.
    """
    
    def __init__(self):
        """Inicializa o gerenciador de alertas"""
        self.alert_log: List[Dict[str, Any]] = []
    
    def check_liquidation(
        self,
        db: Session,
        liquidation_data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Verifica se uma liquidação dispara algum alerta.
        
        Args:
            db: Sessão do banco de dados
            liquidation_data: Dados da liquidação
            
        Returns:
            Lista de alertas disparados
        """
        triggered = []
        
        symbol = liquidation_data.get("symbol", "").upper()
        exchange = liquidation_data.get("exchange", "").lower()
        value_usd = float(liquidation_data.get("value_usd", 0))
        liquidation_id = liquidation_data.get("liquidation_id", "")
        
        # Busca alertas ativos para o símbolo
        alerts = get_alerts(db, symbol=symbol, is_active=True)
        
        for alert in alerts:
            # Verifica se exchange corresponde (se especificada)
            if alert.exchange and alert.exchange != exchange:
                continue
            
            # Verifica threshold
            if value_usd >= alert.threshold_usd:
                # Dispara alerta
                triggered_alert = trigger_alert(db, alert.id, 0)  # ID temporário
                
                alert_info = {
                    "alert_id": alert.id,
                    "alert_name": alert.name,
                    "symbol": symbol,
                    "exchange": exchange,
                    "threshold_usd": alert.threshold_usd,
                    "actual_value_usd": value_usd,
                    "timestamp": datetime.utcnow().isoformat(),
                    "notification_type": alert.notification_type
                }
                
                triggered.append(alert_info)
                self.alert_log.append(alert_info)
                
                # Envia notificação
                self._send_notification(alert, liquidation_data)
                
                logger.warning(
                    f"ALERTA DISPARADO: {alert.name} - "
                    f"Symbol: {symbol}, Value: ${value_usd:.2f}, "
                    f"Threshold: ${alert.threshold_usd:.2f}"
                )
        
        return triggered
    
    def _send_notification(
        self,
        alert,
        liquidation_data: Dict[str, Any]
    ) -> bool:
        """
        Envia notificação do alerta.
        
        Args:
            alert: Objeto Alert
            liquidation_data: Dados da liquidação
            
        Returns:
            True se enviada com sucesso
        """
        notification_type = alert.notification_type
        
        if notification_type == "log":
            # Apenas log (já feito acima)
            return True
        
        elif notification_type == "telegram":
            return self._send_telegram(alert, liquidation_data)
        
        elif notification_type == "email":
            return self._send_email(alert, liquidation_data)
        
        elif notification_type == "webhook":
            return self._send_webhook(alert, liquidation_data)
        
        logger.warning(f"Tipo de notificação desconhecido: {notification_type}")
        return False
    
    def _send_telegram(
        self,
        alert,
        liquidation_data: Dict[str, Any]
    ) -> bool:
        """Envia notificação via Telegram"""
        try:
            config = json.loads(alert.notification_config or "{}")
            bot_token = config.get("bot_token")
            chat_id = config.get("chat_id")
            
            if not bot_token or not chat_id:
                logger.error("Configuração Telegram incompleta")
                return False
            
            import requests
            
            message = f"🚨 *ALERTA DE LIQUIDAÇÃO*\n\n"
            message += f"*Símbolo:* {liquidation_data.get('symbol')}\n"
            message += f"*Exchange:* {liquidation_data.get('exchange')}\n"
            message += f"*Valor:* ${liquidation_data.get('value_usd', 0):,.2f}\n"
            message += f"*Preço:* ${liquidation_data.get('price', 0):,.2f}\n"
            message += f"*Alerta:* {alert.name}"
            
            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
            data = {
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "Markdown"
            }
            
            response = requests.post(url, json=data, timeout=10)
            return response.status_code == 200
            
        except Exception as e:
            logger.error(f"Erro ao enviar Telegram: {e}")
            return False
    
    def _send_email(
        self,
        alert,
        liquidation_data: Dict[str, Any]
    ) -> bool:
        """Envia notificação via Email (stub)"""
        # Implementação futura com smtplib
        logger.info(f"Email alert would be sent: {alert.name}")
        return True
    
    def _send_webhook(
        self,
        alert,
        liquidation_data: Dict[str, Any]
    ) -> bool:
        """Envia notificação via Webhook"""
        try:
            config = json.loads(alert.notification_config or "{}")
            webhook_url = config.get("url")
            
            if not webhook_url:
                logger.error("URL do webhook não configurada")
                return False
            
            payload = {
                "alert": {
                    "name": alert.name,
                    "symbol": alert.symbol,
                    "threshold_usd": alert.threshold_usd
                },
                "liquidation": liquidation_data,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            import requests
            response = requests.post(
                webhook_url,
                json=payload,
                timeout=10,
                headers={"Content-Type": "application/json"}
            )
            
            return response.status_code in [200, 201, 202]
            
        except Exception as e:
            logger.error(f"Erro ao enviar webhook: {e}")
            return False
    
    def get_alert_log(
        self,
        limit: int = 100,
        symbol: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Retorna log de alertas.
        
        Args:
            limit: Número máximo de registros
            symbol: Filtrar por símbolo
            
        Returns:
            Lista de alertas disparados
        """
        log = self.alert_log
        
        if symbol:
            log = [a for a in log if a.get("symbol") == symbol.upper()]
        
        return log[-limit:]
    
    def clear_log(self) -> None:
        """Limpa o log de alertas"""
        self.alert_log.clear()
        logger.info("Log de alertas limpo")


# Instância global
alert_manager = AlertManager()


# Funções de convenience para a API

async def create_new_alert(
    db: Session,
    name: str,
    symbol: str,
    threshold_usd: float,
    exchange: Optional[str] = None,
    notification_type: str = "log",
    notification_config: Optional[str] = None
):
    """
    Cria um novo alerta via API.
    """
    return create_alert(
        db=db,
        name=name,
        symbol=symbol,
        threshold_usd=threshold_usd,
        exchange=exchange,
        notification_type=notification_type,
        notification_config=notification_config
    )
