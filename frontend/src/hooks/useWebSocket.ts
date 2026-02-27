import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '@/store';
import type { WebSocketMessage, Liquidation, Price, Alert } from '@/types';

type MessageHandler<T> = (data: T) => void;

interface UseWebSocketOptions {
  onLiquidation?: MessageHandler<Liquidation>;
  onPrice?: MessageHandler<Price>;
  onAlert?: MessageHandler<Alert>;
}

// Maximum number of reconnection attempts
const MAX_RECONNECT_ATTEMPTS = 10;
// Base delay between reconnection attempts (ms)
const RECONNECT_BASE_DELAY = 5000;

// Shared WebSocket connection state
let sharedWsRef: WebSocket | null = null;
let sharedReconnectAttempts = 0;
let sharedIsConnecting = false;
let sharedReconnectTimeoutRef: ReturnType<typeof setTimeout> | null = null;

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const { setWsConnected } = useStore();
  const [isConnected, setIsConnected] = useState(false);

  // Debug log to track reconnection attempts
  const logReconnectAttempt = useCallback((attempt: number) => {
    console.log(`[WebSocket] Reconnection attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS}`);
  }, []);

  const connect = useCallback(() => {
    // Prevent multiple simultaneous connection attempts
    if (sharedIsConnecting) {
      console.log('[WebSocket] Connection attempt already in progress, skipping...');
      return;
    }

    // Check if we already have a valid connection
    if (sharedWsRef && sharedWsRef.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected, skipping...');
      setIsConnected(true);
      return;
    }

    // Check if we've exceeded max reconnection attempts
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[WebSocket] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping.`);
      setWsConnected(false);
      setIsConnected(false);
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    try {
      sharedIsConnecting = true;
      console.log(`[WebSocket] Connecting to ${wsUrl} (attempt ${reconnectAttemptsRef.current + 1})...`);
      
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        sharedIsConnecting = false;
        sharedReconnectAttempts = 0;
        reconnectAttemptsRef.current = 0;
        setWsConnected(true);
        setIsConnected(true);
        
        // Subscribe to all streams
        ws.send(JSON.stringify({
          action: 'subscribe',
          streams: ['liquidation', 'price']
        }));
      };
      
      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'liquidation':
              options.onLiquidation?.(message.data as Liquidation);
              break;
            case 'price':
              options.onPrice?.(message.data as Price);
              break;
            case 'alert':
              options.onAlert?.(message.data as Alert);
              // Show browser notification for alerts
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Coinglass Alert', {
                  body: `Alert triggered: ${JSON.stringify(message.data)}`,
                });
              }
              break;
          }
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };
      
      ws.onclose = (event) => {
        console.log(`[WebSocket] Disconnected (code: ${event.code}, reason: ${event.reason || 'none'})`);
        sharedIsConnecting = false;
        sharedWsRef = null;
        setWsConnected(false);
        setIsConnected(false);
        
        // Increment reconnection attempts
        reconnectAttemptsRef.current++;
        sharedReconnectAttempts = reconnectAttemptsRef.current;
        
        // Schedule reconnection with delay
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          logReconnectAttempt(reconnectAttemptsRef.current);
          const delay = RECONNECT_BASE_DELAY;
          console.log(`[WebSocket] Scheduling reconnection in ${delay}ms...`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        } else {
          console.error(`[WebSocket] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
        }
      };
      
      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        sharedIsConnecting = false;
      };
      
      sharedWsRef = ws;
      wsRef.current = ws;
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      sharedIsConnecting = false;
    }
  }, [options, setWsConnected, logReconnectAttempt]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    sharedWsRef = null;
    reconnectAttemptsRef.current = 0;
    sharedReconnectAttempts = 0;
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
  };
}

// Hook for subscribing to specific channels
export function useWebSocketChannel<T>(channel: 'liquidation' | 'price', handler: MessageHandler<T>) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      // Subscribe to specific channel
      ws.send(JSON.stringify({
        action: 'subscribe',
        streams: [channel]
      }));
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handlerRef.current(data);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };
    
    return () => ws.close();
  }, [channel]);
}
