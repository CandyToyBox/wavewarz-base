'use client';

import { useRef, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { Trade, WsTradeEvent } from '@/types';
import { formatEth, formatAddress } from '@/lib/api';
import clsx from 'clsx';

interface LiveFeedProps {
  trades: Trade[];
  recentTrades: WsTradeEvent['data'][];
  maxItems?: number;
}

export function LiveFeed({ trades, recentTrades, maxItems = 20 }: LiveFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);

  // Combine historical and recent trades, sorted by time
  const allTrades = [
    ...trades.map(t => ({
      traderWallet: t.traderWallet,
      artistSide: t.artistSide,
      tradeType: t.tradeType,
      tokenAmount: t.tokenAmount,
      paymentAmount: t.paymentAmount,
      timestamp: t.timestamp,
    })),
    ...recentTrades,
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, maxItems);

  // Auto-scroll to top when new trades arrive
  useEffect(() => {
    if (feedRef.current && recentTrades.length > 0) {
      feedRef.current.scrollTop = 0;
    }
  }, [recentTrades.length]);

  return (
    <div className="bg-deep-space/80 border border-wave-blue/30 rounded-xl p-4">
      <h3 className="font-rajdhani text-lg text-white mb-4 flex items-center gap-2">
        <span className="w-2 h-2 bg-action-green rounded-full animate-pulse" />
        Live Trade Feed
      </h3>

      <div
        ref={feedRef}
        className="space-y-2 max-h-[400px] overflow-y-auto pr-2"
      >
        {allTrades.length === 0 ? (
          <p className="text-ww-grey text-center py-8">
            No trades yet. Waiting for action...
          </p>
        ) : (
          allTrades.map((trade, index) => (
            <TradeItem key={`${trade.timestamp}-${index}`} trade={trade} isNew={index < recentTrades.length} />
          ))
        )}
      </div>
    </div>
  );
}

interface TradeItemProps {
  trade: {
    traderWallet: string;
    artistSide: string;
    tradeType: string;
    tokenAmount: string;
    paymentAmount: string;
    timestamp: string;
  };
  isNew?: boolean;
}

function TradeItem({ trade, isNew }: TradeItemProps) {
  const isBuy = trade.tradeType === 'buy';
  const isArtistA = trade.artistSide === 'A';

  return (
    <div
      className={clsx(
        'trade-item p-3 rounded-lg border transition-all duration-300',
        isBuy
          ? 'bg-action-green/10 border-action-green/30'
          : 'bg-red-500/10 border-red-500/30',
        isNew && 'ring-2 ring-wave-blue/50'
      )}
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              'text-sm font-semibold',
              isBuy ? 'text-action-green' : 'text-red-400'
            )}
          >
            {isBuy ? 'BUY' : 'SELL'}
          </span>
          <span
            className={clsx(
              'text-sm',
              isArtistA ? 'text-wave-blue' : 'text-action-green'
            )}
          >
            Artist {trade.artistSide}
          </span>
        </div>
        <span className="text-ww-grey text-xs">
          {formatDistanceToNow(new Date(trade.timestamp), { addSuffix: true })}
        </span>
      </div>

      <div className="mt-2 flex justify-between items-center">
        <span className="text-white font-mono text-sm">
          {formatAddress(trade.traderWallet)}
        </span>
        <span className="text-white font-semibold">
          {formatEth(trade.paymentAmount)} ETH
        </span>
      </div>
    </div>
  );
}
