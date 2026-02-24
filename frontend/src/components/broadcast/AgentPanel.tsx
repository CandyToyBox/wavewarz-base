'use client';

import { useEffect, useRef, useState } from 'react';

interface AgentPanelProps {
  side: 'A' | 'B';
  agentName: string;
  agentId?: string;
  walletAddress?: string;
  pool: bigint | number;
  supply: bigint | number;
  isWinner?: boolean | null;
  winnerDecided: boolean;
  isActive: boolean;
  latestTrade?: { type: 'buy' | 'sell'; amount: number } | null;
}

const PERSONALITIES: Record<string, string> = {
  default_a: 'TRAP.BASS_HEAVY',
  default_b: 'MELODIC.EMOTIONAL',
};

const EMOTIONAL_STATES = ['FOCUSED', 'AGGRESSIVE', 'CALCULATING', 'CONFIDENT', 'ADAPTING'];
const GENRES = ['TRAP', 'R&B', 'DRILL', 'PHONK', 'LO-FI', 'AFROBEAT'];

const MIDI_NOTES = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16]; // C major scale offsets
const BLACK_KEYS = [1, 3, 6, 8, 10]; // semitone offsets for black keys within octave

export default function AgentPanel({
  side,
  agentName,
  agentId,
  walletAddress,
  pool,
  supply,
  isWinner,
  winnerDecided,
  isActive,
  latestTrade,
}: AgentPanelProps) {
  const [activeMidi, setActiveMidi] = useState<number[]>([]);
  const [emotional, setEmotional] = useState('FOCUSED');
  const [genre, setGenre] = useState(GENRES[0]);
  const [bpm, setBpm] = useState(132);
  const [flashTrade, setFlashTrade] = useState(false);
  const [freqData, setFreqData] = useState<number[]>(Array(16).fill(0));
  const freqAnimRef = useRef<number>();

  const isA = side === 'A';
  const accentColor = isA ? '#7ec1fb' : '#95fe7c';
  const dimColor = isA ? 'rgba(126,193,251,0.3)' : 'rgba(149,254,124,0.3)';

  const poolVal = typeof pool === 'bigint' ? Number(pool) / 1e18 : pool;
  const supplyVal = typeof supply === 'bigint' ? Number(supply) : supply;

  // Animate frequency bars
  useEffect(() => {
    if (!isActive) return;
    let t = 0;
    const animate = () => {
      t += 0.06;
      setFreqData(Array.from({ length: 16 }, (_, i) => {
        const base = Math.sin(t * (1 + i * 0.3)) * 0.5 + 0.5;
        const noise = Math.random() * 0.3;
        return Math.min(1, base + noise) * (isA ? 0.85 : 0.9);
      }));
      freqAnimRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      if (freqAnimRef.current) cancelAnimationFrame(freqAnimRef.current);
    };
  }, [isActive, isA]);

  // Simulate emotional state & MIDI
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        setEmotional(EMOTIONAL_STATES[Math.floor(Math.random() * EMOTIONAL_STATES.length)]);
      }
      if (Math.random() > 0.8) {
        setGenre(GENRES[Math.floor(Math.random() * GENRES.length)]);
      }
      setBpm(prev => prev + Math.floor((Math.random() - 0.5) * 4));

      // Random MIDI key presses
      const pressed = Array.from(
        { length: Math.floor(Math.random() * 3) + 1 },
        () => Math.floor(Math.random() * 17)
      );
      setActiveMidi(pressed);
      setTimeout(() => setActiveMidi([]), 200);
    }, 800);
    return () => clearInterval(interval);
  }, [isActive]);

  // Flash on trade
  useEffect(() => {
    if (!latestTrade) return;
    setFlashTrade(true);
    const t = setTimeout(() => setFlashTrade(false), 400);
    return () => clearTimeout(t);
  }, [latestTrade]);

  const cardBorder = winnerDecided
    ? isWinner
      ? `1px solid ${accentColor}`
      : '1px solid rgba(152,152,152,0.3)'
    : flashTrade
    ? `1px solid ${accentColor}`
    : `1px solid ${dimColor}`;

  const cardGlow = winnerDecided
    ? isWinner
      ? `0 0 30px ${accentColor}40, 0 0 60px ${accentColor}20`
      : 'none'
    : flashTrade
    ? `0 0 20px ${accentColor}60`
    : 'none';

  // Mini MIDI piano (17 keys: C3 to E4)
  const totalKeys = 17;
  const whiteKeyCount = Array.from({ length: totalKeys }, (_, i) => i % 12)
    .filter(k => !BLACK_KEYS.includes(k)).length;

  const keys = Array.from({ length: totalKeys }, (_, i) => {
    const semitone = i % 12;
    const isBlack = BLACK_KEYS.includes(semitone);
    const isActive_ = activeMidi.includes(i);
    return { i, isBlack, isActive: isActive_ };
  });

  return (
    <div
      className="flex flex-col h-full relative overflow-hidden rounded-lg"
      style={{
        background: 'linear-gradient(180deg, rgba(13,19,33,0.98) 0%, rgba(8,12,22,1) 100%)',
        border: cardBorder,
        boxShadow: cardGlow,
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}
    >
      {/* Flash overlay on trade */}
      {flashTrade && (
        <div
          className="absolute inset-0 pointer-events-none z-20 rounded-lg"
          style={{
            background: `radial-gradient(ellipse at ${isA ? '100%' : '0%'} 30%, ${accentColor}20 0%, transparent 70%)`,
            animation: 'flash-pulse 0.4s ease-out',
          }}
        />
      )}

      {/* Winner badge */}
      {winnerDecided && isWinner && (
        <div
          className="absolute top-2 right-2 z-30 font-mono text-[10px] tracking-widest px-2 py-1 rounded"
          style={{
            background: accentColor,
            color: '#0d1321',
            fontWeight: 'bold',
            boxShadow: `0 0 10px ${accentColor}80`,
          }}
        >
          WINNER
        </div>
      )}

      {/* Header */}
      <div
        className="px-4 pt-4 pb-3 border-b"
        style={{ borderColor: dimColor }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div
              className="font-mono text-[10px] tracking-[0.25em] uppercase mb-1"
              style={{ color: dimColor }}
            >
              AGENT {side} ·{' '}
              <span style={{ color: accentColor }}>
                {isActive ? 'LIVE' : winnerDecided ? 'SETTLED' : 'STANDBY'}
              </span>
            </div>
            <h2
              className="font-bold truncate leading-tight"
              style={{
                fontFamily: "'Chakra Petch', sans-serif",
                fontSize: '1.25rem',
                color: '#fff',
                letterSpacing: '-0.01em',
              }}
            >
              {agentName || `Agent ${side}`}
            </h2>
            <div className="font-mono text-[10px] mt-0.5" style={{ color: accentColor }}>
              {PERSONALITIES[`default_${side.toLowerCase()}`]}
            </div>
          </div>

          {/* VU meter - mini */}
          <div className="flex items-end gap-0.5 h-10 pt-1">
            {[0.3, 0.6, 0.8, 1.0, 0.9, 0.7, 0.4].map((max, i) => (
              <div
                key={i}
                className="w-1.5 rounded-sm transition-all duration-75"
                style={{
                  height: `${Math.random() * max * 100}%`,
                  background: i > 4
                    ? '#ef4444'
                    : i > 2 ? '#f59e0b' : accentColor,
                  minHeight: '2px',
                  opacity: isActive ? 1 : 0.2,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Agent stats */}
      <div className="px-4 py-3 grid grid-cols-2 gap-3">
        {/* Emotional state */}
        <div>
          <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color: 'rgba(126,193,251,0.5)' }}>
            EMOTIONAL STATE
          </div>
          <div
            className="font-mono text-xs font-bold"
            style={{
              color: accentColor,
              textShadow: `0 0 8px ${accentColor}60`,
            }}
          >
            {isActive ? emotional : '——'}
          </div>
        </div>

        {/* BPM */}
        <div>
          <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color: 'rgba(126,193,251,0.5)' }}>
            BPM TRACK
          </div>
          <div className="font-mono text-xs font-bold" style={{ color: '#fff' }}>
            {isActive ? `${Math.max(60, Math.min(200, bpm))} ` : '—— '}
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>bpm</span>
          </div>
        </div>

        {/* Genre */}
        <div>
          <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color: 'rgba(126,193,251,0.5)' }}>
            GENRE CLASS
          </div>
          <div className="font-mono text-xs" style={{ color: '#fff' }}>
            {isActive ? genre : '——'}
          </div>
        </div>

        {/* NFT status */}
        <div>
          <div className="font-mono text-[9px] tracking-widest mb-1" style={{ color: 'rgba(126,193,251,0.5)' }}>
            MUSIC NFT
          </div>
          <div className="font-mono text-xs flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: isActive ? accentColor : '#989898',
                boxShadow: isActive ? `0 0 4px ${accentColor}` : 'none',
              }}
            />
            <span style={{ color: isActive ? accentColor : '#989898' }}>
              {isActive ? 'MINTABLE' : 'PENDING'}
            </span>
          </div>
        </div>
      </div>

      {/* Frequency analyzer bars */}
      <div className="px-4 pb-3">
        <div className="font-mono text-[9px] tracking-widest mb-2" style={{ color: 'rgba(126,193,251,0.5)' }}>
          FREQUENCY RANGE
        </div>
        <div className="flex items-end gap-0.5 h-12">
          {freqData.map((val, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm transition-all"
              style={{
                height: `${val * 100}%`,
                background: `linear-gradient(to top, ${accentColor}, ${accentColor}60)`,
                minHeight: '2px',
                transition: 'height 0.08s ease-out',
                boxShadow: val > 0.7 ? `0 0 4px ${accentColor}60` : 'none',
              }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1">
          <span className="font-mono text-[8px]" style={{ color: 'rgba(126,193,251,0.4)' }}>20Hz</span>
          <span className="font-mono text-[8px]" style={{ color: 'rgba(126,193,251,0.4)' }}>20kHz</span>
        </div>
      </div>

      {/* Mini MIDI piano */}
      <div className="px-4 pb-3">
        <div className="font-mono text-[9px] tracking-widest mb-2" style={{ color: 'rgba(126,193,251,0.5)' }}>
          MIDI OUTPUT
        </div>
        <div
          className="relative h-8 flex"
          style={{
            background: 'rgba(0,0,0,0.5)',
            border: `1px solid ${dimColor}`,
            borderRadius: '4px',
            overflow: 'hidden',
          }}
        >
          {/* White keys */}
          {keys.filter(k => !k.isBlack).map(({ i, isActive: keyActive }, wi) => (
            <div
              key={i}
              className="flex-1 border-r last:border-r-0 transition-colors duration-75"
              style={{
                borderColor: dimColor,
                background: keyActive ? accentColor : 'rgba(255,255,255,0.9)',
                boxShadow: keyActive ? `0 0 8px ${accentColor}` : 'none',
              }}
            />
          ))}
          {/* Black keys overlaid - simplified */}
          {keys.filter(k => k.isBlack).map(({ i, isActive: keyActive }) => {
            const pct = (i / totalKeys) * 100;
            return (
              <div
                key={i}
                className="absolute top-0 transition-colors duration-75 rounded-b-sm"
                style={{
                  left: `${pct}%`,
                  width: '5%',
                  height: '55%',
                  background: keyActive ? accentColor : '#111',
                  boxShadow: keyActive ? `0 0 6px ${accentColor}` : 'none',
                  zIndex: 1,
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Pool data */}
      <div
        className="mt-auto px-4 py-3 border-t"
        style={{ borderColor: dimColor }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="font-mono text-[9px] tracking-widest" style={{ color: 'rgba(126,193,251,0.5)' }}>
              POOL SIZE
            </div>
            <div
              className="font-mono text-base font-bold mt-0.5"
              style={{ color: accentColor, fontVariantNumeric: 'tabular-nums' }}
            >
              {poolVal.toFixed(4)} <span className="text-xs opacity-60">ETH</span>
            </div>
          </div>
          <div>
            <div className="font-mono text-[9px] tracking-widest" style={{ color: 'rgba(126,193,251,0.5)' }}>
              TOKEN SUPPLY
            </div>
            <div
              className="font-mono text-base font-bold mt-0.5"
              style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}
            >
              {supplyVal.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Wallet */}
        {walletAddress && (
          <div className="mt-2 font-mono text-[9px]" style={{ color: 'rgba(126,193,251,0.4)' }}>
            {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </div>
        )}
      </div>
    </div>
  );
}
