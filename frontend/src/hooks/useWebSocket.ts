import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '@/store';

// Shared WebSocket instance (singleton)
let sharedWs: WebSocket | null = null;
let reconnectTimer: any = null;
let reconnectAttempts = 0;
let isConnecting = false;
const MAX_BACKOFF = 30000;
const INITIAL_BACKOFF = 2000;

// Set of active listeners/subscribers for the shared instance
const listeners = new Set<(data: any) => void>();

export function useWebSocket() {
  const { setWsConnected } = useStore();
  const [localConnected, setLocalConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);

  const connect = useCallback(() => {
    if (isConnecting || (sharedWs && (sharedWs.readyState === WebSocket.OPEN || sharedWs.readyState === WebSocket.CONNECTING))) {
      return;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Connect DIRECTLY to Binance Public Futures Stream
    const symbol = 'btcusdt';
    const wsUrl = `wss://fstream.binance.com/stream?streams=${symbol}@forceOrder/${symbol}@aggTrade`;

    console.log(`[WebSocket] Connecting to Binance ${wsUrl} (attempt ${reconnectAttempts + 1})...`);

    isConnecting = true;
    const ws = new WebSocket(wsUrl);
    sharedWs = ws;

    ws.onopen = () => {
      console.log('[WebSocket] Connected to Binance Streams');
      isConnecting = false;
      reconnectAttempts = 0;
      setWsConnected(true);
      setLocalConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (!payload.stream) return;

        let formattedMsg: any = null;

        if (payload.stream.includes('@forceOrder')) {
          const data = payload.data.o;
          // Map Binance liquidation to our type
          formattedMsg = {
            type: 'liquidation',
            data: {
              id: String(payload.data.E),
              symbol: data.s,
              side: data.S === 'BUY' ? 'short' : 'long', // if side is BUY, a short was liquidated
              price: parseFloat(data.ap),
              quantity: parseFloat(data.q),
              amount: parseFloat(data.ap) * parseFloat(data.q),
              exchange: 'binance',
              timestamp: new Date(payload.data.E).toISOString()
            }
          };
        } else if (payload.stream.includes('@aggTrade')) {
          const data = payload.data;
          formattedMsg = {
            type: 'price',
            data: {
              symbol: data.s,
              price: parseFloat(data.p),
              timestamp: new Date(data.T).toISOString()
            }
          };
        }

        if (formattedMsg) {
          setLastMessage(formattedMsg);
          listeners.forEach(listener => listener(formattedMsg));
        }

      } catch (e) {
        console.error('[WebSocket] Error parsing Binance message:', e);
      }
    };

    ws.onclose = (event) => {
      console.log(`[WebSocket] Connection closed`);
      isConnecting = false;
      sharedWs = null;
      setWsConnected(false);
      setLocalConnected(false);

      const delay = Math.min(INITIAL_BACKOFF * Math.pow(2, reconnectAttempts), MAX_BACKOFF);
      reconnectAttempts++;
      console.log(`[WebSocket] Reconnecting in ${delay}ms...`);
      reconnectTimer = setTimeout(connect, delay);
    };

    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
      ws.close();
    };
  }, [setWsConnected]);

  useEffect(() => {
    const listener = (data: any) => setLastMessage(data);
    listeners.add(listener);

    if (!sharedWs) {
      connect();
    } else if (sharedWs.readyState === WebSocket.OPEN) {
      setLocalConnected(true);
    }

    return () => {
      listeners.delete(listener);
      // Clear reconnect timer
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      // Remove event handlers and close WebSocket
      if (sharedWs) {
        sharedWs.onopen = null;
        sharedWs.onmessage = null;
        sharedWs.onclose = null;
        sharedWs.onerror = null;
        sharedWs.close();
        sharedWs = null;
      }
      isConnecting = false;
    };
  }, [connect]);

  return {
    isConnected: localConnected,
    lastMessage,
    // Add a helper to send messages through the shared socket (though not strictly needed for public streams)
    send: (msg: any) => {
      if (sharedWs?.readyState === WebSocket.OPEN) {
        sharedWs.send(JSON.stringify(msg));
      }
    }
  };
}

/**
 * Compatibility hook for specific channels
 */
export function useWebSocketChannel<T>(channel: string, handler: (data: T) => void) {
  const { lastMessage } = useWebSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (lastMessage && lastMessage.type === channel) {
      handlerRef.current(lastMessage.data);
    }
  }, [lastMessage, channel]);
}
