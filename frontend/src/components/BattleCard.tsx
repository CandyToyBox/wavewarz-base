'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { Battle } from '@/types';
import { formatEth, calculatePoolPercentage } from '@/lib/api';
import clsx from 'clsx';

interface BattleCardProps {
  battle: Battle;
}

export function BattleCard({ battle }: BattleCardProps) {
  const pools = calculatePoolPercentage(battle.artistAPool, battle.artistBPool);
  const isActive = battle.status === 'active';
  const isLive = isActive && new Date(battle.startTime) <= new Date();

  const getStatusBadge = () => {
    switch (battle.status) {
      case 'active':
        return <span className="badge-active">LIVE</span>;
      case 'pending':
        return <span className="badge-pending">UPCOMING</span>;
      case 'completed':
      case 'settled':
        return <span className="badge-completed">ENDED</span>;
      default:
        return null;
    }
  };

  const getTimeInfo = () => {
    if (battle.status === 'pending') {
      return `Starts ${formatDistanceToNow(new Date(battle.startTime), { addSuffix: true })}`;
    }
    if (battle.status === 'active') {
      return `Ends ${formatDistanceToNow(new Date(battle.endTime), { addSuffix: true })}`;
    }
    return `Ended ${formatDistanceToNow(new Date(battle.endTime), { addSuffix: true })}`;
  };

  return (
    <Link href={`/battles/${battle.battleId}`}>
      <div className={clsx(
        'battle-card bg-deep-space/80 border border-wave-blue/30 rounded-xl p-6',
        'hover:border-wave-blue/60 transition-all duration-300 cursor-pointer',
        isLive && 'animate-pulse-glow'
      )}>
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-rajdhani text-xl text-white mb-1">
              Battle #{battle.battleId}
            </h3>
            <p className="text-ww-grey text-sm">{getTimeInfo()}</p>
          </div>
          {getStatusBadge()}
        </div>

        {/* Artists */}
        <div className="flex justify-between items-center mb-6">
          <div className="text-center flex-1">
            <p className="text-wave-blue font-semibold truncate px-2">
              {battle.artistAAgentId}
            </p>
            {battle.winnerDecided && battle.winnerIsArtistA && (
              <span className="text-action-green text-xs">WINNER</span>
            )}
          </div>
          <div className="text-ww-grey font-rajdhani text-2xl px-4">VS</div>
          <div className="text-center flex-1">
            <p className="text-action-green font-semibold truncate px-2">
              {battle.artistBAgentId}
            </p>
            {battle.winnerDecided && !battle.winnerIsArtistA && (
              <span className="text-action-green text-xs">WINNER</span>
            )}
          </div>
        </div>

        {/* Pool Bars */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-wave-blue">{pools.a}%</span>
            <span className="text-ww-grey">
              Total: {formatEth(
                (BigInt(battle.artistAPool) + BigInt(battle.artistBPool)).toString()
              )} {battle.paymentToken}
            </span>
            <span className="text-action-green">{pools.b}%</span>
          </div>
          <div className="h-3 bg-deep-space rounded-full overflow-hidden flex">
            <div
              className="pool-bar bg-wave-blue h-full"
              style={{ width: `${pools.a}%` }}
            />
            <div
              className="pool-bar bg-action-green h-full"
              style={{ width: `${pools.b}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 pt-4 border-t border-wave-blue/20 flex justify-between items-center">
          <span className="text-ww-grey text-sm">
            {battle.paymentToken} Battle
          </span>
          {isLive && (
            <span className="flex items-center gap-2 text-action-green text-sm">
              <span className="w-2 h-2 bg-action-green rounded-full animate-pulse" />
              Live Trading
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
