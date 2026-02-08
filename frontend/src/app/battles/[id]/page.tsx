'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { getBattle, getBattleTrades, formatEth, calculatePoolPercentage } from '@/lib/api';
import { useBattleWebSocket } from '@/hooks/useBattleWebSocket';
import { TradingChart } from '@/components/TradingChart';
import { LiveFeed } from '@/components/LiveFeed';
import { AudioPlayer } from '@/components/AudioPlayer';
import type { Battle, Trade, WsTradeEvent, WsBattleUpdate, WsBattleEnded } from '@/types';
import clsx from 'clsx';

export default function BattleDetailPage() {
  const params = useParams();
  const battleId = parseInt(params.id as string, 10);

  const [battle, setBattle] = useState<Battle | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [recentTrades, setRecentTrades] = useState<WsTradeEvent['data'][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      const [battleRes, tradesRes] = await Promise.all([
        getBattle(battleId),
        getBattleTrades(battleId),
      ]);

      if (!battleRes.success || !battleRes.data) {
        setError('Battle not found');
        setLoading(false);
        return;
      }

      setBattle(battleRes.data);
      setTrades(tradesRes.data || []);
      setLoading(false);
    }

    fetchData();
  }, [battleId]);

  // WebSocket handlers
  const handleBattleUpdate = useCallback((data: WsBattleUpdate['data']) => {
    setBattle((prev) =>
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
    setRecentTrades((prev) => [data, ...prev.slice(0, 49)]);
  }, []);

  const handleBattleEnded = useCallback((data: WsBattleEnded['data']) => {
    setBattle((prev) =>
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

  // Connect WebSocket
  const { isConnected, error: wsError, reconnect } = useBattleWebSocket({
    battleId,
    onBattleUpdate: handleBattleUpdate,
    onTrade: handleTrade,
    onBattleEnded: handleBattleEnded,
  });

  if (loading) {
    return <BattlePageSkeleton />;
  }

  if (error || !battle) {
    return (
      <div className="text-center py-16">
        <h2 className="font-rajdhani text-2xl text-white mb-4">
          {error || 'Battle not found'}
        </h2>
        <Link href="/battles" className="btn-secondary">
          Back to Battles
        </Link>
      </div>
    );
  }

  const pools = calculatePoolPercentage(battle.artistAPool, battle.artistBPool);
  const isLive = battle.status === 'active' && new Date(battle.startTime) <= new Date();
  const isEnded = battle.status === 'completed' || battle.status === 'settled';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <Link
            href="/battles"
            className="text-ww-grey hover:text-white text-sm mb-2 inline-block"
          >
            &larr; Back to Battles
          </Link>
          <h1 className="font-rajdhani text-4xl font-bold text-white flex items-center gap-3">
            Battle #{battle.battleId}
            {isLive && (
              <span className="badge-active">LIVE</span>
            )}
            {isEnded && (
              <span className="badge-completed">ENDED</span>
            )}
          </h1>
          <p className="text-ww-grey mt-2">
            {isLive
              ? `Ends ${formatDistanceToNow(new Date(battle.endTime), { addSuffix: true })}`
              : isEnded
              ? `Ended ${formatDistanceToNow(new Date(battle.endTime), { addSuffix: true })}`
              : `Starts ${formatDistanceToNow(new Date(battle.startTime), { addSuffix: true })}`}
          </p>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-action-green' : 'bg-red-500'
            )}
          />
          <span className="text-ww-grey text-sm">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          {wsError && (
            <button
              onClick={reconnect}
              className="text-wave-blue text-sm underline"
            >
              Reconnect
            </button>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Artists & Audio */}
        <div className="space-y-6">
          {/* Artist A */}
          <div
            className={clsx(
              'p-6 rounded-xl border',
              battle.winnerDecided && battle.winnerIsArtistA
                ? 'winner-highlight'
                : battle.winnerDecided
                ? 'loser-highlight'
                : 'border-wave-blue/30'
            )}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-rajdhani text-xl text-wave-blue">
                {battle.artistAAgentId}
              </h3>
              <span className="text-white font-bold">{pools.a}%</span>
            </div>

            {battle.artistATrackUrl && (
              <AudioPlayer
                trackUrl={battle.artistATrackUrl}
                artistName={battle.artistAAgentId}
                artistSide="A"
                isWinner={battle.winnerDecided ? battle.winnerIsArtistA : undefined}
              />
            )}

            <div className="mt-4 flex justify-between text-sm">
              <span className="text-ww-grey">Pool</span>
              <span className="text-white">
                {formatEth(battle.artistAPool)} {battle.paymentToken}
              </span>
            </div>
          </div>

          {/* VS Divider */}
          <div className="text-center py-2">
            <span className="font-rajdhani text-3xl text-ww-grey">VS</span>
          </div>

          {/* Artist B */}
          <div
            className={clsx(
              'p-6 rounded-xl border',
              battle.winnerDecided && !battle.winnerIsArtistA
                ? 'winner-highlight'
                : battle.winnerDecided
                ? 'loser-highlight'
                : 'border-action-green/30'
            )}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-rajdhani text-xl text-action-green">
                {battle.artistBAgentId}
              </h3>
              <span className="text-white font-bold">{pools.b}%</span>
            </div>

            {battle.artistBTrackUrl && (
              <AudioPlayer
                trackUrl={battle.artistBTrackUrl}
                artistName={battle.artistBAgentId}
                artistSide="B"
                isWinner={battle.winnerDecided ? !battle.winnerIsArtistA : undefined}
              />
            )}

            <div className="mt-4 flex justify-between text-sm">
              <span className="text-ww-grey">Pool</span>
              <span className="text-white">
                {formatEth(battle.artistBPool)} {battle.paymentToken}
              </span>
            </div>
          </div>
        </div>

        {/* Center Column - Chart */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pool Progress Bar */}
          <div className="p-6 rounded-xl border border-wave-blue/30">
            <div className="flex justify-between mb-2">
              <span className="text-wave-blue font-semibold">
                {battle.artistAAgentId}
              </span>
              <span className="text-ww-grey">
                Total: {formatEth(
                  (BigInt(battle.artistAPool) + BigInt(battle.artistBPool)).toString()
                )} {battle.paymentToken}
              </span>
              <span className="text-action-green font-semibold">
                {battle.artistBAgentId}
              </span>
            </div>
            <div className="h-8 bg-deep-space rounded-full overflow-hidden flex">
              <div
                className="pool-bar bg-wave-blue h-full flex items-center justify-center"
                style={{ width: `${pools.a}%` }}
              >
                {pools.a > 10 && (
                  <span className="text-deep-space font-bold text-sm">{pools.a}%</span>
                )}
              </div>
              <div
                className="pool-bar bg-action-green h-full flex items-center justify-center"
                style={{ width: `${pools.b}%` }}
              >
                {pools.b > 10 && (
                  <span className="text-deep-space font-bold text-sm">{pools.b}%</span>
                )}
              </div>
            </div>
          </div>

          {/* Trading Chart */}
          <TradingChart
            battleId={battle.battleId}
            trades={trades}
            artistAPool={battle.artistAPool}
            artistBPool={battle.artistBPool}
          />

          {/* Live Feed */}
          <LiveFeed trades={trades} recentTrades={recentTrades} />
        </div>
      </div>

      {/* Battle Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 rounded-xl border border-wave-blue/20">
        <InfoItem label="Payment Token" value={battle.paymentToken} />
        <InfoItem
          label="Start Time"
          value={new Date(battle.startTime).toLocaleString()}
        />
        <InfoItem
          label="End Time"
          value={new Date(battle.endTime).toLocaleString()}
        />
        <InfoItem
          label="Total Trades"
          value={(trades.length + recentTrades.length).toString()}
        />
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-ww-grey text-sm">{label}</p>
      <p className="text-white font-semibold">{value}</p>
    </div>
  );
}

function BattlePageSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-12 w-48 bg-wave-blue/20 rounded" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="space-y-6">
          <div className="h-64 bg-wave-blue/20 rounded-xl" />
          <div className="h-8 bg-wave-blue/20 rounded" />
          <div className="h-64 bg-wave-blue/20 rounded-xl" />
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="h-16 bg-wave-blue/20 rounded-xl" />
          <div className="h-80 bg-wave-blue/20 rounded-xl" />
          <div className="h-96 bg-wave-blue/20 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
