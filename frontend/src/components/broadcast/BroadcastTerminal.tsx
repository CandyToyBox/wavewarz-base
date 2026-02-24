'use client';

import { useState, useEffect, useCallback } from 'react';
import IntroSequence from './IntroSequence';
import AgentPanel from './AgentPanel';
import CenterTimer from './CenterTimer';
import WaveformVisualizer from './WaveformVisualizer';
import BondingCurveChart from './BondingCurveChart';
import TradeFeed, { TradeEvent } from './TradeFeed';
import AgentIntel from './AgentIntel';
import { soundEngine } from './SoundEngine';

export interface BattleData {
  id: string;
  battleId: number;
  status: 'pending' | 'active' | 'completed' | 'settled';
  artistAAgentId?: string;
  artistBAgentId?: string;
  artistAWallet?: string;
  artistBWallet?: string;
  startTime?: string | null;
  endTime?: string | null;
  artistAPool: string;
  artistBPool: string;
  artistASupply: string;
  artistBSupply: string;
  winnerDecided: boolean;
  winnerIsArtistA?: boolean | null;
  agentAName?: string;
  agentBName?: string;
}

interface BroadcastTerminalProps {
  battle: BattleData | null;
  trades?: TradeEvent[];
  onRefresh?: () => void;
}

export default function BroadcastTerminal({
  battle,
  trades = [],
  onRefresh,
}: BroadcastTerminalProps) {
  const [introComplete, setIntroComplete] = useState(false);
  const [visible, setVisible] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [latestTradeA, setLatestTradeA] = useState<{ type: 'buy' | 'sell'; amount: number } | null>(null);
  const [latestTradeB, setLatestTradeB] = useState<{ type: 'buy' | 'sell'; amount: number } | null>(null);

  const poolA = battle ? Number(BigInt(battle.artistAPool || '0')) : 0;
  const poolB = battle ? Number(BigInt(battle.artistBPool || '0')) : 0;
  const supplyA = battle ? Number(BigInt(battle.artistASupply || '0')) : 0;
  const supplyB = battle ? Number(BigInt(battle.artistBSupply || '0')) : 0;

  const isActive = battle?.status === 'active';
  const winnerDecided = battle?.winnerDecided ?? false;
  const isWinnerA = battle?.winnerIsArtistA ?? null;

  const agentAName = battle?.agentAName || battle?.artistAAgentId?.slice(0, 12) || 'AGENT_A';
  const agentBName = battle?.agentBName || battle?.artistBAgentId?.slice(0, 12) || 'AGENT_B';

  // Staggered entrance after intro
  const handleIntroComplete = useCallback(() => {
    setIntroComplete(true);
    setTimeout(() => setVisible(true), 100);
  }, []);

  // Toggle sound
  useEffect(() => {
    soundEngine?.setEnabled(soundEnabled);
  }, [soundEnabled]);

  // Track latest trades for agent panel flash
  useEffect(() => {
    if (trades.length === 0) return;
    const latest = trades[trades.length - 1];
    if (!latest) return;

    if (latest.side === 'A') {
      setLatestTradeA({ type: latest.type, amount: latest.amount });
    } else {
      setLatestTradeB({ type: latest.type, amount: latest.amount });
    }
  }, [trades]);

  // Battle end sound
  useEffect(() => {
    if (winnerDecided && isWinnerA !== null && isWinnerA !== undefined) {
      soundEngine?.battleEnd(isWinnerA ? 'A' : 'B');
    }
  }, [winnerDecided, isWinnerA]);

  return (
    <>
      {/* Boot sequence intro */}
      {!introComplete && <IntroSequence onComplete={handleIntroComplete} />}

      {/* Main terminal */}
      <div
        className="min-h-screen flex flex-col relative"
        style={{
          background: '#050810',
          opacity: visible ? 1 : 0,
          transform: visible ? 'none' : 'translateY(8px)',
          transition: 'opacity 0.8s ease-out, transform 0.8s ease-out',
        }}
      >
        {/* Global CRT scanlines overlay */}
        <div
          className="fixed inset-0 pointer-events-none z-40"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px, transparent 1px, transparent 2px)',
          }}
        />

        {/* Film grain */}
        <div
          className="fixed inset-0 pointer-events-none z-40"
          style={{
            opacity: 0.025,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Tech grid background */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(126,193,251,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(126,193,251,0.025) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />

        {/* ── Broadcast Bar ──────────────────────────── */}
        <div
          className="relative z-10 flex items-center justify-between px-6 py-2 border-b"
          style={{
            background: 'rgba(8,12,22,0.95)',
            borderColor: 'rgba(126,193,251,0.12)',
          }}
        >
          {/* Live indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: isActive ? '#ef4444' : '#989898',
                  boxShadow: isActive ? '0 0 6px #ef4444' : 'none',
                  animation: isActive ? 'glow-pulse 1s ease-in-out infinite' : 'none',
                }}
              />
              <span className="font-mono text-[10px] tracking-[0.2em]" style={{ color: isActive ? '#ef4444' : '#989898' }}>
                {isActive ? 'LIVE' : winnerDecided ? 'ENDED' : 'STANDBY'}
              </span>
            </div>
            <span className="font-mono text-[10px]" style={{ color: 'rgba(126,193,251,0.4)' }}>
              BATTLE #{battle?.battleId || '—'}
            </span>
          </div>

          {/* Logo center */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
            <span
              className="font-black tracking-tight"
              style={{
                fontFamily: "'Chakra Petch', sans-serif",
                fontSize: '1rem',
                color: '#7ec1fb',
                textShadow: '0 0 12px rgba(126,193,251,0.6)',
                letterSpacing: '-0.02em',
              }}
            >
              WAVE<span style={{ color: '#95fe7c', textShadow: '0 0 12px rgba(149,254,124,0.6)' }}>WARZ</span>
            </span>
            <span className="font-mono text-[9px] tracking-widest" style={{ color: 'rgba(126,193,251,0.4)' }}>
              BASE
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSoundEnabled(v => !v)}
              className="font-mono text-[10px] px-2 py-1 rounded transition-colors"
              style={{
                border: '1px solid rgba(126,193,251,0.2)',
                color: soundEnabled ? '#7ec1fb' : 'rgba(126,193,251,0.3)',
                background: 'transparent',
              }}
            >
              {soundEnabled ? '♪ AUDIO ON' : '♪ AUDIO OFF'}
            </button>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="font-mono text-[10px] px-2 py-1 rounded transition-colors"
                style={{
                  border: '1px solid rgba(126,193,251,0.2)',
                  color: 'rgba(126,193,251,0.5)',
                  background: 'transparent',
                }}
              >
                ↺ SYNC
              </button>
            )}
          </div>
        </div>

        {/* ── TOP ZONE: THE STAGE ───────────────────── */}
        <div className="relative z-10 grid grid-cols-[1fr_200px_1fr] gap-3 p-4" style={{ minHeight: '280px' }}>
          {/* Agent A Panel */}
          <div
            style={{
              animation: visible ? 'fade-up 0.6s ease-out 0.2s both' : 'none',
            }}
          >
            <AgentPanel
              side="A"
              agentName={agentAName}
              agentId={battle?.artistAAgentId}
              walletAddress={battle?.artistAWallet}
              pool={poolA}
              supply={supplyA}
              isWinner={isWinnerA}
              winnerDecided={winnerDecided}
              isActive={isActive}
              latestTrade={latestTradeA}
            />
          </div>

          {/* Center Timer */}
          <div
            className="flex items-center justify-center"
            style={{
              animation: visible ? 'fade-up 0.6s ease-out 0.1s both' : 'none',
            }}
          >
            <CenterTimer
              endTime={battle?.endTime || null}
              startTime={battle?.startTime || null}
              isActive={isActive}
              winnerDecided={winnerDecided}
            />
          </div>

          {/* Agent B Panel */}
          <div
            style={{
              animation: visible ? 'fade-up 0.6s ease-out 0.2s both' : 'none',
            }}
          >
            <AgentPanel
              side="B"
              agentName={agentBName}
              agentId={battle?.artistBAgentId}
              walletAddress={battle?.artistBWallet}
              pool={poolB}
              supply={supplyB}
              isWinner={isWinnerA === null ? null : !isWinnerA}
              winnerDecided={winnerDecided}
              isActive={isActive}
              latestTrade={latestTradeB}
            />
          </div>
        </div>

        {/* ── MIDDLE ZONE: AUDIO VISUALIZATION ─────── */}
        <div
          className="relative z-10 px-4 pb-3"
          style={{
            height: '140px',
            animation: visible ? 'fade-up 0.6s ease-out 0.4s both' : 'none',
          }}
        >
          <WaveformVisualizer
            isActive={isActive}
            sideAColor="#7ec1fb"
            sideBColor="#95fe7c"
            poolA={poolA}
            poolB={poolB}
          />
        </div>

        {/* ── AGENT INTELLIGENCE ────────────────────── */}
        <div
          className="relative z-10 px-4 pb-3"
          style={{
            animation: visible ? 'fade-up 0.6s ease-out 0.5s both' : 'none',
          }}
        >
          <AgentIntel
            poolA={poolA}
            poolB={poolB}
            supplyA={supplyA}
            supplyB={supplyB}
            isActive={isActive}
            winnerDecided={winnerDecided}
            isWinnerA={isWinnerA}
            agentAName={agentAName}
            agentBName={agentBName}
          />
        </div>

        {/* ── LOWER ZONE: TRADING + CHARTS ──────────── */}
        <div
          className="relative z-10 px-4 pb-6 grid grid-cols-[1fr_200px_1fr] gap-3"
          style={{
            minHeight: '280px',
            animation: visible ? 'fade-up 0.6s ease-out 0.6s both' : 'none',
          }}
        >
          {/* Agent A bonding curve */}
          <BondingCurveChart
            side="A"
            agentName={agentAName}
            pool={poolA}
            supply={supplyA}
            isActive={isActive}
            isWinner={isWinnerA}
            winnerDecided={winnerDecided}
          />

          {/* Center trade feed */}
          <TradeFeed
            trades={trades}
            agentAName={agentAName}
            agentBName={agentBName}
            isActive={isActive}
          />

          {/* Agent B bonding curve */}
          <BondingCurveChart
            side="B"
            agentName={agentBName}
            pool={poolB}
            supply={supplyB}
            isActive={isActive}
            isWinner={isWinnerA === null ? null : !isWinnerA}
            winnerDecided={winnerDecided}
          />
        </div>

        {/* ── Battle status footer ───────────────────── */}
        {winnerDecided && (
          <div
            className="relative z-10 mx-4 mb-4 rounded-lg p-4 text-center"
            style={{
              background: isWinnerA === null
                ? 'rgba(245,158,11,0.1)'
                : isWinnerA
                ? 'rgba(126,193,251,0.08)'
                : 'rgba(149,254,124,0.08)',
              border: `1px solid ${isWinnerA === null ? '#f59e0b' : isWinnerA ? '#7ec1fb' : '#95fe7c'}40`,
            }}
          >
            <div
              className="font-bold"
              style={{
                fontFamily: "'Chakra Petch', sans-serif",
                fontSize: '1.5rem',
                color: isWinnerA === null ? '#f59e0b' : isWinnerA ? '#7ec1fb' : '#95fe7c',
                textShadow: `0 0 20px ${isWinnerA === null ? '#f59e0b' : isWinnerA ? '#7ec1fb' : '#95fe7c'}60`,
                letterSpacing: '0.05em',
              }}
            >
              {isWinnerA === null
                ? '⚡ BATTLE CONCLUDED'
                : isWinnerA
                ? `◄ ${agentAName} WINS ►`
                : `◄ ${agentBName} WINS ►`}
            </div>
            <div className="font-mono text-xs mt-1" style={{ color: 'rgba(126,193,251,0.5)' }}>
              SETTLEMENT COMPLETE · CLAIM YOUR REWARDS
            </div>
          </div>
        )}

        {/* No battle state */}
        {!battle && introComplete && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="text-4xl font-bold mb-3"
                style={{
                  fontFamily: "'Chakra Petch', sans-serif",
                  color: '#7ec1fb',
                  textShadow: '0 0 20px rgba(126,193,251,0.5)',
                }}
              >
                NO ACTIVE BATTLE
              </div>
              <div className="font-mono text-sm" style={{ color: 'rgba(126,193,251,0.5)' }}>
                Waiting for next battle to initialize...
              </div>
              <div className="font-mono text-xs mt-2 animate-pulse" style={{ color: '#95fe7c' }}>
                ● BROADCAST STANDING BY
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
