'use client';

import { useEffect, useRef, useState } from 'react';

interface AgentIntelProps {
  poolA: number;
  poolB: number;
  supplyA: number;
  supplyB: number;
  isActive: boolean;
  winnerDecided: boolean;
  isWinnerA?: boolean | null;
  agentAName: string;
  agentBName: string;
}

function calcWinProb(poolA: number, poolB: number): number {
  const total = poolA + poolB;
  if (total === 0) return 0.5;
  return poolA / total;
}

export default function AgentIntel({
  poolA,
  poolB,
  supplyA,
  supplyB,
  isActive,
  winnerDecided,
  isWinnerA,
  agentAName,
  agentBName,
}: AgentIntelProps) {
  const heatmapRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>();
  const [sentimentA, setSentimentA] = useState(0.5);
  const [sentimentB, setSentimentB] = useState(0.5);
  const [winProbA, setWinProbA] = useState(50);
  const [beatPulse, setBeatPulse] = useState(false);
  const [momentum, setMomentum] = useState<'A' | 'B' | 'EVEN'>('EVEN');

  const probA = winnerDecided
    ? (isWinnerA ? 100 : 0)
    : calcWinProb(poolA, poolB) * 100;
  const probB = 100 - probA;

  // Smooth animated win probability
  useEffect(() => {
    setWinProbA(prev => {
      const target = probA;
      return prev + (target - prev) * 0.15;
    });
  }, [probA]);

  // Momentum tracking
  useEffect(() => {
    if (!isActive) return;
    if (Math.abs(probA - 50) < 5) setMomentum('EVEN');
    else if (probA > 55) setMomentum('A');
    else setMomentum('B');
  }, [probA, isActive]);

  // Simulate sentiment changes
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      const baseA = poolA / Math.max(poolA + poolB, 1);
      setSentimentA(baseA + (Math.random() - 0.5) * 0.1);
      setSentimentB(1 - baseA + (Math.random() - 0.5) * 0.1);

      // Beat pulse
      setBeatPulse(true);
      setTimeout(() => setBeatPulse(false), 100);
    }, 1800);
    return () => clearInterval(interval);
  }, [isActive, poolA, poolB]);

  // Sentiment heat map
  useEffect(() => {
    const canvas = heatmapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let t = 0;

    function draw() {
      canvas!.width = canvas!.offsetWidth * window.devicePixelRatio;
      canvas!.height = canvas!.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      const W = canvas!.offsetWidth;
      const H = canvas!.offsetHeight;

      ctx.fillStyle = 'rgba(8,12,22,0.9)';
      ctx.fillRect(0, 0, W, H);

      const cols = 20;
      const rows = 8;
      const cellW = W / cols;
      const cellH = H / rows;

      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
          const pct = col / cols;
          // Left half = Agent A sentiment, right half = Agent B
          const isAgentA = col < cols / 2;
          const baseSentiment = isAgentA ? sentimentA : sentimentB;

          const noise = Math.sin(col * 0.8 + t * 0.5 + row * 0.4) * 0.3 + baseSentiment;
          const val = Math.max(0, Math.min(1, noise));

          let r, g, b;
          if (val < 0.33) {
            // Cold: deep blue
            r = 13; g = 19 + val * 100; b = 100 + val * 155;
          } else if (val < 0.66) {
            // Mid: cyan/teal
            const v = (val - 0.33) * 3;
            r = 0 + v * 126; g = 180 + v * 73; b = 251 - v * 100;
          } else {
            // Hot: green
            const v = (val - 0.66) * 3;
            r = 126 + v * 23; g = 251; b = 251 - v * 177;
          }

          ctx.fillStyle = `rgba(${r},${g},${b},${0.4 + val * 0.4})`;
          const margin = 1;
          ctx.fillRect(
            col * cellW + margin,
            row * cellH + margin,
            cellW - margin * 2,
            cellH - margin * 2
          );
        }
      }

      // Center divider
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(W / 2 - 0.5, 0, 1, H);

      // Labels
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(126,193,251,0.6)';
      ctx.fillText(agentAName.slice(0, 8) || 'AGENT A', 4, H - 4);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(149,254,124,0.6)';
      ctx.fillText(agentBName.slice(0, 8) || 'AGENT B', W - 4, H - 4);
      ctx.textAlign = 'left';

      t += 0.04;
      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [sentimentA, sentimentB, agentAName, agentBName]);

  const winProbDisplay = Math.round(winProbA);
  const momentumColor = momentum === 'A' ? '#7ec1fb' : momentum === 'B' ? '#95fe7c' : '#f59e0b';

  return (
    <div
      className="rounded overflow-hidden flex flex-col"
      style={{
        border: '1px solid rgba(126,193,251,0.15)',
        background: 'rgba(8,12,22,0.95)',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-2 border-b flex items-center justify-between"
        style={{ borderColor: 'rgba(126,193,251,0.1)' }}
      >
        <span className="font-mono text-[9px] tracking-widest" style={{ color: 'rgba(126,193,251,0.6)' }}>
          AGENT INTELLIGENCE
        </span>
        <span className="font-mono text-[9px]" style={{ color: momentumColor }}>
          MOMENTUM → {momentum}
        </span>
      </div>

      <div className="flex gap-0 flex-1">
        {/* Left: Sentiment heatmap */}
        <div className="flex-1 flex flex-col">
          <div
            className="px-3 py-1.5 border-b text-[9px] font-mono"
            style={{ borderColor: 'rgba(126,193,251,0.08)', color: 'rgba(126,193,251,0.5)' }}
          >
            SENTIMENT HEATMAP
          </div>
          <canvas ref={heatmapRef} className="w-full" style={{ height: '60px' }} />
        </div>

        {/* Right: Win probability */}
        <div
          className="w-48 border-l flex flex-col"
          style={{ borderColor: 'rgba(126,193,251,0.1)' }}
        >
          <div
            className="px-3 py-1.5 border-b text-[9px] font-mono"
            style={{ borderColor: 'rgba(126,193,251,0.08)', color: 'rgba(126,193,251,0.5)' }}
          >
            WIN PROBABILITY
          </div>

          <div className="flex-1 px-3 py-2 flex flex-col justify-between">
            {/* Agent A prob */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-mono text-[9px]" style={{ color: '#7ec1fb' }}>
                  {(agentAName || 'A').slice(0, 8)}
                </span>
                <span
                  className="font-mono text-xs font-bold"
                  style={{
                    color: winProbDisplay > 50 ? '#7ec1fb' : 'rgba(126,193,251,0.5)',
                    textShadow: winProbDisplay > 60 ? '0 0 8px #7ec1fb' : 'none',
                  }}
                >
                  {winProbDisplay}%
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${winProbDisplay}%`,
                    background: '#7ec1fb',
                    boxShadow: winProbDisplay > 60 ? '0 0 6px rgba(126,193,251,0.7)' : 'none',
                  }}
                />
              </div>
            </div>

            {/* VS divider */}
            <div className="text-center font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
              ·  ·  vs  ·  ·
            </div>

            {/* Agent B prob */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-mono text-[9px]" style={{ color: '#95fe7c' }}>
                  {(agentBName || 'B').slice(0, 8)}
                </span>
                <span
                  className="font-mono text-xs font-bold"
                  style={{
                    color: probB > 50 ? '#95fe7c' : 'rgba(149,254,124,0.5)',
                    textShadow: probB > 60 ? '0 0 8px #95fe7c' : 'none',
                  }}
                >
                  {Math.round(probB)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${probB}%`,
                    background: '#95fe7c',
                    boxShadow: probB > 60 ? '0 0 6px rgba(149,254,124,0.7)' : 'none',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row: Beat pulse + genre + BPM */}
      <div
        className="px-4 py-2 border-t flex items-center gap-4"
        style={{ borderColor: 'rgba(126,193,251,0.1)' }}
      >
        {/* Beat pulse indicator */}
        <div className="flex items-center gap-1.5">
          <div
            className="w-3 h-3 rounded-full transition-all duration-75"
            style={{
              background: beatPulse ? '#95fe7c' : 'rgba(149,254,124,0.2)',
              boxShadow: beatPulse ? '0 0 10px #95fe7c, 0 0 20px rgba(149,254,124,0.5)' : 'none',
              transform: beatPulse ? 'scale(1.4)' : 'scale(1)',
            }}
          />
          <span className="font-mono text-[9px]" style={{ color: 'rgba(126,193,251,0.5)' }}>BEAT</span>
        </div>

        <div className="font-mono text-[9px]" style={{ color: 'rgba(126,193,251,0.5)' }}>
          SUPPLY_A: <span className="text-white">{supplyA.toLocaleString()}</span>
        </div>
        <div className="font-mono text-[9px]" style={{ color: 'rgba(126,193,251,0.5)' }}>
          SUPPLY_B: <span className="text-white">{supplyB.toLocaleString()}</span>
        </div>

        <div className="ml-auto font-mono text-[9px]" style={{ color: 'rgba(126,193,251,0.5)' }}>
          STATUS:{' '}
          <span style={{ color: isActive ? '#95fe7c' : winnerDecided ? '#f59e0b' : '#989898' }}>
            {isActive ? 'ACTIVE' : winnerDecided ? 'SETTLED' : 'STANDBY'}
          </span>
        </div>
      </div>
    </div>
  );
}
