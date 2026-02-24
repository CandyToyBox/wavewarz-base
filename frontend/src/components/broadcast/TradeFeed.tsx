'use client';

import { useEffect, useRef, useState } from 'react';
import { soundEngine } from './SoundEngine';

export interface TradeEvent {
  id: string;
  side: 'A' | 'B';
  type: 'buy' | 'sell';
  amount: number;
  wallet: string;
  timestamp: number;
}

interface TradeFeedProps {
  trades: TradeEvent[];
  agentAName: string;
  agentBName: string;
  isActive: boolean;
}

export default function TradeFeed({ trades, agentAName, agentBName, isActive }: TradeFeedProps) {
  const [displayTrades, setDisplayTrades] = useState<TradeEvent[]>([]);
  const [totalA, setTotalA] = useState(0);
  const [totalB, setTotalB] = useState(0);
  const [tradeCount, setTradeCount] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (trades.length !== prevCountRef.current) {
      const newTrades = trades.slice(-30);
      setDisplayTrades(newTrades);

      // Sound on new trade
      if (trades.length > prevCountRef.current) {
        const latest = trades[trades.length - 1];
        if (latest) soundEngine?.tradeTick(latest.side);
      }
      prevCountRef.current = trades.length;
    }

    const sumA = trades.filter(t => t.side === 'A').reduce((s, t) => s + t.amount, 0);
    const sumB = trades.filter(t => t.side === 'B').reduce((s, t) => s + t.amount, 0);
    setTotalA(sumA);
    setTotalB(sumB);
    setTradeCount(trades.length);
  }, [trades]);

  // Auto scroll to bottom
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [displayTrades]);

  const total = totalA + totalB;
  const pctA = total > 0 ? (totalA / total) * 100 : 50;
  const pctB = total > 0 ? (totalB / total) * 100 : 50;

  // Demo trades if none exist and active
  const [demoTrades, setDemoTrades] = useState<TradeEvent[]>([]);
  useEffect(() => {
    if (!isActive || trades.length > 0) return;
    const agents = [agentAName || 'Agent A', agentBName || 'Agent B'];
    const wallets = ['0x1a2b...c3d4', '0x5e6f...g7h8', '0x9i0j...k1l2', '0x3m4n...o5p6'];

    const interval = setInterval(() => {
      const side = Math.random() > 0.5 ? 'A' : 'B';
      const trade: TradeEvent = {
        id: `demo-${Date.now()}`,
        side: side as 'A' | 'B',
        type: Math.random() > 0.3 ? 'buy' : 'sell',
        amount: Math.random() * 0.05 + 0.001,
        wallet: wallets[Math.floor(Math.random() * wallets.length)],
        timestamp: Date.now(),
      };
      setDemoTrades(prev => [...prev.slice(-29), trade]);
      soundEngine?.tradeTick(side as 'A' | 'B');
    }, 1500);

    return () => clearInterval(interval);
  }, [isActive, trades.length, agentAName, agentBName]);

  const allTrades = trades.length > 0 ? displayTrades : demoTrades;

  return (
    <div
      className="flex flex-col rounded overflow-hidden h-full"
      style={{
        border: '1px solid rgba(126,193,251,0.15)',
        background: 'rgba(8,12,22,0.97)',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 border-b flex items-center justify-between"
        style={{ borderColor: 'rgba(126,193,251,0.12)' }}
      >
        <span className="font-mono text-[9px] tracking-widest" style={{ color: 'rgba(126,193,251,0.6)' }}>
          TRADE FEED
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {tradeCount || allTrades.length} trades
          </span>
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: isActive ? '#95fe7c' : '#989898',
              boxShadow: isActive ? '0 0 4px #95fe7c' : 'none',
            }}
          />
        </div>
      </div>

      {/* Pool bar */}
      <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(126,193,251,0.08)' }}>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[9px]" style={{ color: '#7ec1fb' }}>
            {(agentAName || 'A').slice(0, 10)} {pctA.toFixed(0)}%
          </span>
          <span className="font-mono text-[9px]" style={{ color: '#95fe7c' }}>
            {pctB.toFixed(0)}% {(agentBName || 'B').slice(0, 10)}
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="transition-all duration-500 rounded-l-full"
            style={{ width: `${pctA}%`, background: '#7ec1fb', boxShadow: '0 0 6px rgba(126,193,251,0.5)' }}
          />
          <div
            className="transition-all duration-500 rounded-r-full"
            style={{ width: `${pctB}%`, background: '#95fe7c', boxShadow: '0 0 6px rgba(149,254,124,0.5)' }}
          />
        </div>
      </div>

      {/* Trade list */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(126,193,251,0.3) transparent',
        }}
      >
        {allTrades.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="font-mono text-[10px]" style={{ color: 'rgba(126,193,251,0.3)' }}>
              Waiting for trades...
            </span>
          </div>
        ) : (
          allTrades.map((trade, i) => {
            const isLatest = i === allTrades.length - 1;
            const color = trade.side === 'A' ? '#7ec1fb' : '#95fe7c';
            const isBuy = trade.type === 'buy';
            const agentLabel = trade.side === 'A'
              ? (agentAName || 'Agent A').slice(0, 8)
              : (agentBName || 'Agent B').slice(0, 8);

            return (
              <div
                key={trade.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-sm text-[9px] font-mono"
                style={{
                  background: isLatest
                    ? `${color}12`
                    : 'transparent',
                  borderLeft: `2px solid ${isLatest ? color : color + '40'}`,
                  animation: isLatest ? 'slide-up 0.2s ease-out' : 'none',
                }}
              >
                {/* Buy/sell arrow */}
                <span style={{ color: isBuy ? '#95fe7c' : '#ef4444', width: '8px' }}>
                  {isBuy ? '↑' : '↓'}
                </span>

                {/* Side */}
                <span style={{ color, width: '50px' }} className="truncate">
                  {agentLabel}
                </span>

                {/* Amount */}
                <span style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                  {trade.amount.toFixed(4)}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>ETH</span>

                {/* Wallet */}
                <span className="ml-auto" style={{ color: 'rgba(126,193,251,0.4)' }}>
                  {trade.wallet}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer totals */}
      <div
        className="px-3 py-2 border-t"
        style={{ borderColor: 'rgba(126,193,251,0.1)' }}
      >
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="font-mono text-[8px]" style={{ color: 'rgba(126,193,251,0.5)' }}>VOL A</div>
            <div className="font-mono text-xs font-bold" style={{ color: '#7ec1fb', fontVariantNumeric: 'tabular-nums' }}>
              {(totalA / 1e18 || totalA).toFixed(4)} <span className="text-[9px] opacity-50">ETH</span>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[8px]" style={{ color: 'rgba(149,254,124,0.5)' }}>VOL B</div>
            <div className="font-mono text-xs font-bold" style={{ color: '#95fe7c', fontVariantNumeric: 'tabular-nums' }}>
              {(totalB / 1e18 || totalB).toFixed(4)} <span className="text-[9px] opacity-50">ETH</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
