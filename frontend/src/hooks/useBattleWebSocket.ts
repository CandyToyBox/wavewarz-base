'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { WsEvent, WsBattleUpdate, WsTradeEvent, WsBattleEnded } from '@/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

interface UseBattleWebSocketOptions {
  battleId: number;
  onBattleUpdate?: (data: WsBattleUpdate['data']) => void;
  onTrade?: (data: WsTradeEvent['data']) => void;
  onBattleEnded?: (data: WsBattleEnded['data']) => void;
}

interface UseBattleWebSocketResult {
  isConnected: boolean;
  error: string | null;
  reconnect: () => void;
}

export function useBattleWebSocket({
  battleId,
  onBattleUpdate,
  onTrade,
  onBattleEnded,
}: UseBattleWebSocketOptions): UseBattleWebSocketResult {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(`${WS_URL}/ws/battles/${battleId}`);

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
        console.log(`WebSocket connected to battle ${battleId}`);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WsEvent;

          switch (message.type) {
            case 'battle_update':
              onBattleUpdate?.(message.data);
              break;
            case 'trade':
              onTrade?.(message.data);
              break;
            case 'battle_ended':
              onBattleEnded?.(message.data);
              break;
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Connection error');
      };

      ws.onclose = () => {
        setIsConnected(false);
        console.log(`WebSocket disconnected from battle ${battleId}`);

        // Attempt reconnection with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.pow(2, reconnectAttempts.current) * 1000;
          reconnectAttempts.current++;

          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Attempting reconnect (${reconnectAttempts.current}/${maxReconnectAttempts})...`);
            connect();
          }, delay);
        } else {
          setError('Failed to reconnect after multiple attempts');
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to connect');
    }
  }, [battleId, onBattleUpdate, onTrade, onBattleEnded]);

  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    reconnectAttempts.current = 0;
    setError(null);
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { isConnected, error, reconnect };
}
