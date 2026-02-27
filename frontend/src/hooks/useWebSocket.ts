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

    // Connect DIRECTLY to backend — bypasses Vite proxy to avoid HMR conflicts
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//127.0.0.1:8000/ws`;

    console.log(`[WebSocket] Connecting to ${wsUrl} (attempt ${reconnectAttempts + 1})...`);

    isConnecting = true;
    const ws = new WebSocket(wsUrl);
    sharedWs = ws;

    ws.onopen = () => {
      console.log('[WebSocket] Shared connection open');
      isConnecting = false;
      reconnectAttempts = 0;
      setWsConnected(true);
      setLocalConnected(true);

      // Auto-subscribe to main streams
      ws.send(JSON.stringify({
        action: 'subscribe',
        streams: ['liquidation', 'price']
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
        // Notify any other hooks that might be listening
        listeners.forEach(listener => listener(data));
      } catch (e) {
        console.error('[WebSocket] Error parsing message:', e);
      }
    };

    ws.onclose = (event) => {
      console.log(`[WebSocket] Connection closed (code: ${event.code})`);
      isConnecting = false;
      sharedWs = null;
      setWsConnected(false);
      setLocalConnected(false);

      if (event.code !== 1000) {
        const delay = Math.min(INITIAL_BACKOFF * Math.pow(2, reconnectAttempts), MAX_BACKOFF);
        reconnectAttempts++;
        console.log(`[WebSocket] Reconnecting in ${delay}ms...`);
        reconnectTimer = setTimeout(connect, delay);
      }
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
    };
  }, [connect]);

  return {
    isConnected: localConnected,
    lastMessage,
    // Add a helper to send messages through the shared socket
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
