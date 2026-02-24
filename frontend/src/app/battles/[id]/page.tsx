'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getBattle, getBattleTrades } from '@/lib/api';
import { useBattleWebSocket } from '@/hooks/useBattleWebSocket';
import BroadcastTerminal from '@/components/broadcast/BroadcastTerminal';
import type { TradeEvent } from '@/components/broadcast/TradeFeed';
import type { Battle, Trade, WsTradeEvent, WsBattleUpdate, WsBattleEnded } from '@/types';

function mapTrade(t: Trade, idx: number): TradeEvent {
  return {
    id: t.id || String(idx),
    side: t.artistSide as 'A' | 'B',
    type: t.tradeType as 'buy' | 'sell',
    amount: parseFloat(t.paymentAmount || '0') / 1e18,
    wallet: t.traderWallet
      ? `${t.traderWallet.slice(0, 6)}...${t.traderWallet.slice(-4)}`
      : '0x????',
    timestamp: new Date(t.timestamp).getTime(),
  };
}

export default function BattleDetailPage() {
  const params = useParams();
  const battleId = parseInt(params.id as string, 10);

  const [battle, setBattle] = useState<Battle | null>(null);
  const [tradeEvents, setTradeEvents] = useState<TradeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    const [battleRes, tradesRes] = await Promise.all([
      getBattle(battleId),
      getBattleTrades(battleId),
    ]);
    if (battleRes.success && battleRes.data) {
      setBattle(battleRes.data);
    }
    if (tradesRes.data) {
      setTradeEvents((tradesRes.data as Trade[]).map(mapTrade));
    }
  }, [battleId]);

  // Initial fetch
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const [battleRes, tradesRes] = await Promise.all([
          getBattle(battleId),
          getBattleTrades(battleId),
        ]);

        if (!battleRes.success || !battleRes.data) {
          setError('Battle not found');
        } else {
          setBattle(battleRes.data);
          setTradeEvents(((tradesRes.data as Trade[]) || []).map(mapTrade));
        }
      } catch {
        setError('Failed to load battle');
      }
      setLoading(false);
    }
    fetchData();
  }, [battleId]);

  // WebSocket handlers
  const handleBattleUpdate = useCallback((data: WsBattleUpdate['data']) => {
    setBattle(prev =>
      prev
        ? {
            ...prev,
            artistAPool: data.artistAPool,
            artistBPool: data.artistBPool,
            artistASupply: data.artistASupply,
            artistBSupply: data.artistBSupply,
          }
        : null
    );
  }, []);

  const handleTrade = useCallback((data: WsTradeEvent['data']) => {
    const evt: TradeEvent = {
      id: `ws-${Date.now()}`,
      side: data.artistSide as 'A' | 'B',
      type: data.tradeType as 'buy' | 'sell',
      amount: parseFloat(data.paymentAmount || '0') / 1e18,
      wallet: data.traderWallet
        ? `${data.traderWallet.slice(0, 6)}...${data.traderWallet.slice(-4)}`
        : '0x????',
      timestamp: Date.now(),
    };
    setTradeEvents(prev => [...prev.slice(-99), evt]);
  }, []);

  const handleBattleEnded = useCallback((data: WsBattleEnded['data']) => {
    setBattle(prev =>
      prev
        ? {
            ...prev,
            status: 'settled',
            winnerDecided: true,
            winnerIsArtistA: data.winnerIsArtistA,
            artistAPool: data.artistAPool,
            artistBPool: data.artistBPool,
          }
        : null
    );
  }, []);

  useBattleWebSocket({
    battleId,
    onBattleUpdate: handleBattleUpdate,
    onTrade: handleTrade,
    onBattleEnded: handleBattleEnded,
  });

  // Loading skeleton (terminal style)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050810' }}>
        <div className="text-center">
          <div
            className="text-2xl font-bold mb-4 animate-pulse"
            style={{
              fontFamily: "'Chakra Petch', sans-serif",
              color: '#7ec1fb',
              textShadow: '0 0 15px rgba(126,193,251,0.5)',
            }}
          >
            LOADING BATTLE #{battleId}
          </div>
          <div className="font-mono text-sm" style={{ color: 'rgba(126,193,251,0.4)' }}>
            Syncing with Base blockchain...
          </div>
          <div className="flex justify-center gap-1 mt-4">
            {[0, 1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: '#7ec1fb',
                  animation: `glow-pulse 1s ease-in-out ${i * 0.15}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#050810' }}>
        <div className="text-center">
          <div
            className="text-3xl font-bold mb-3"
            style={{
              fontFamily: "'Chakra Petch', sans-serif",
              color: '#ef4444',
            }}
          >
            SIGNAL LOST
          </div>
          <p className="font-mono text-sm mb-6" style={{ color: 'rgba(126,193,251,0.5)' }}>
            {error}
          </p>
          <Link
            href="/battles"
            className="font-mono text-sm px-4 py-2 rounded"
            style={{
              border: '1px solid rgba(126,193,251,0.3)',
              color: '#7ec1fb',
            }}
          >
            ← BACK TO BATTLES
          </Link>
        </div>
      </div>
    );
  }

  // Map battle to BroadcastTerminal format
  const broadcastBattle = battle
    ? {
        id: battle.id,
        battleId: battle.battleId,
        status: battle.status,
        artistAAgentId: battle.artistAAgentId,
        artistBAgentId: battle.artistBAgentId,
        artistAWallet: battle.artistAWallet,
        artistBWallet: battle.artistBWallet,
        startTime: battle.startTime,
        endTime: battle.endTime,
        artistAPool: battle.artistAPool,
        artistBPool: battle.artistBPool,
        artistASupply: battle.artistASupply,
        artistBSupply: battle.artistBSupply,
        winnerDecided: battle.winnerDecided,
        winnerIsArtistA: battle.winnerIsArtistA,
        agentAName: battle.artistAAgentId,
        agentBName: battle.artistBAgentId,
      }
    : null;

  return (
    <BroadcastTerminal
      battle={broadcastBattle}
      trades={tradeEvents}
      onRefresh={handleRefresh}
    />
  );
}
