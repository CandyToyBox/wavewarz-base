'use client';

import { useEffect, useRef, useState } from 'react';

interface PricePoint {
  time: number;
  price: number;
}

interface BondingCurveChartProps {
  side: 'A' | 'B';
  agentName: string;
  pool: number;
  supply: number;
  isActive: boolean;
  isWinner?: boolean | null;
  winnerDecided: boolean;
  onRipple?: () => void;
}

function sqrtPrice(supply: number, k = 1000): number {
  return Math.sqrt(supply / k);
}

export default function BondingCurveChart({
  side,
  agentName,
  pool,
  supply,
  isActive,
  isWinner,
  winnerDecided,
  onRipple,
}: BondingCurveChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>();
  const priceHistoryRef = useRef<PricePoint[]>([]);
  const rippleRef = useRef<{ x: number; y: number; r: number; alpha: number }[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);

  const isA = side === 'A';
  const accentColor = isA ? '#7ec1fb' : '#95fe7c';

  // Track price history from pool/supply data
  useEffect(() => {
    if (!isActive || supply <= 0) return;
    const price = sqrtPrice(supply);
    const now = Date.now();

    priceHistoryRef.current.push({ time: now, price });

    // Keep last 120 points
    if (priceHistoryRef.current.length > 120) {
      priceHistoryRef.current.shift();
    }

    const history = priceHistoryRef.current;
    if (history.length >= 2) {
      const old = history[Math.max(0, history.length - 10)].price;
      const change = old > 0 ? ((price - old) / old) * 100 : 0;
      setPriceChange(change);
    }
    setCurrentPrice(price);
  }, [pool, supply, isActive]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let t = 0;

    // Generate initial demo price data if empty
    if (priceHistoryRef.current.length < 5 && isActive) {
      const now = Date.now();
      for (let i = 20; i >= 0; i--) {
        const s = supply * (1 - i * 0.02);
        priceHistoryRef.current.push({
          time: now - i * 2000,
          price: sqrtPrice(Math.max(1, s)) + (Math.random() - 0.5) * 0.02,
        });
      }
    }

    function triggerRipple(x: number, y: number) {
      rippleRef.current.push({ x, y, r: 0, alpha: 0.8 });
    }

    function draw() {
      canvas!.width = canvas!.offsetWidth * window.devicePixelRatio;
      canvas!.height = canvas!.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      const W = canvas!.offsetWidth;
      const H = canvas!.offsetHeight;

      // Background
      ctx.fillStyle = 'rgba(8,12,22,0.95)';
      ctx.fillRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = 'rgba(126,193,251,0.06)';
      ctx.lineWidth = 0.5;
      for (let g = 0; g <= 4; g++) {
        const y = (g / 4) * H;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      for (let g = 0; g <= 6; g++) {
        const x = (g / 6) * W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }

      const history = priceHistoryRef.current;

      if (history.length >= 2) {
        const prices = history.map(p => p.price);
        const minP = Math.min(...prices) * 0.95;
        const maxP = Math.max(...prices) * 1.05;
        const range = maxP - minP || 1;

        const toX = (i: number) => (i / (history.length - 1)) * W;
        const toY = (p: number) => H - ((p - minP) / range) * H * 0.85 - H * 0.075;

        // Gradient fill under line
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, `${accentColor}30`);
        grad.addColorStop(1, `${accentColor}00`);

        ctx.beginPath();
        ctx.moveTo(toX(0), H);
        history.forEach((pt, i) => {
          ctx.lineTo(toX(i), toY(pt.price));
        });
        ctx.lineTo(toX(history.length - 1), H);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Price line
        ctx.beginPath();
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2;
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 8;
        ctx.lineJoin = 'round';
        history.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(toX(i), toY(pt.price));
          else ctx.lineTo(toX(i), toY(pt.price));
        });
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Current price dot
        const lastX = toX(history.length - 1);
        const lastY = toY(history[history.length - 1].price);
        ctx.beginPath();
        ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.shadowColor = accentColor;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Trigger ripple occasionally when active
        if (isActive && Math.random() > 0.97) {
          triggerRipple(lastX, lastY);
          onRipple?.();
        }

        // Current price line
        ctx.strokeStyle = `${accentColor}30`;
        ctx.lineWidth = 0.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, lastY);
        ctx.lineTo(W, lastY);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Ripple effects
      rippleRef.current = rippleRef.current.filter(r => r.alpha > 0.01);
      rippleRef.current.forEach(r => {
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.strokeStyle = `${accentColor}`;
        ctx.globalAlpha = r.alpha;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;

        r.r += 3;
        r.alpha *= 0.85;
      });

      // Sound wave ripple overlay on new trade
      if (isActive && t % 120 === 0) {
        // Simulate trade ripple
        for (let rr = 0; rr < 3; rr++) {
          rippleRef.current.push({
            x: Math.random() * W * 0.3 + W * 0.7,
            y: Math.random() * H * 0.6 + H * 0.2,
            r: 0,
            alpha: 0.4 - rr * 0.12,
          });
        }
      }

      t++;
      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [accentColor, isActive, onRipple]);

  const priceUp = priceChange >= 0;

  return (
    <div
      className="flex flex-col h-full rounded overflow-hidden"
      style={{
        border: `1px solid ${accentColor}30`,
        background: 'rgba(8,12,22,0.95)',
        boxShadow: winnerDecided && isWinner
          ? `0 0 30px ${accentColor}30, inset 0 0 30px ${accentColor}08`
          : 'none',
        transition: 'box-shadow 0.5s',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: `${accentColor}20` }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: isActive ? accentColor : '#989898',
              boxShadow: isActive ? `0 0 6px ${accentColor}` : 'none',
            }}
          />
          <span
            className="font-bold truncate"
            style={{
              fontFamily: "'Chakra Petch', sans-serif",
              fontSize: '0.8rem',
              color: '#fff',
              letterSpacing: '0.02em',
            }}
          >
            {agentName || `Agent ${side}`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Price */}
          <div className="text-right">
            <div
              className="font-mono text-sm font-bold"
              style={{
                color: accentColor,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {currentPrice.toFixed(4)}
            </div>
            <div
              className="font-mono text-[9px]"
              style={{ color: priceUp ? '#95fe7c' : '#ef4444' }}
            >
              {priceUp ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
            </div>
          </div>

          {/* Pool */}
          <div className="text-right">
            <div className="font-mono text-xs text-white font-bold">
              {(pool / 1e18).toFixed(4)}
            </div>
            <div className="font-mono text-[9px]" style={{ color: 'rgba(126,193,251,0.5)' }}>
              ETH POOL
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 relative">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {/* Winner overlay */}
        {winnerDecided && isWinner && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${accentColor}15 0%, transparent 70%)`,
            }}
          >
            <div
              className="font-mono text-xs tracking-[0.3em] px-3 py-1.5 rounded"
              style={{
                background: `${accentColor}20`,
                border: `1px solid ${accentColor}60`,
                color: accentColor,
                textShadow: `0 0 10px ${accentColor}`,
              }}
            >
              WINNER
            </div>
          </div>
        )}

        {!isActive && !winnerDecided && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-xs" style={{ color: 'rgba(126,193,251,0.3)' }}>
              AWAITING BATTLE START
            </span>
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div
        className="flex items-center justify-between px-4 py-2 border-t"
        style={{ borderColor: `${accentColor}15` }}
      >
        <div className="flex gap-4">
          <div>
            <span className="font-mono text-[9px]" style={{ color: 'rgba(126,193,251,0.4)' }}>SUPPLY </span>
            <span className="font-mono text-[9px] text-white">{supply.toLocaleString()}</span>
          </div>
          <div>
            <span className="font-mono text-[9px]" style={{ color: 'rgba(126,193,251,0.4)' }}>CURVE </span>
            <span className="font-mono text-[9px] text-white">√k</span>
          </div>
        </div>
        <div
          className="font-mono text-[9px]"
          style={{ color: isActive ? accentColor : 'rgba(126,193,251,0.3)' }}
        >
          {isActive ? '● LIVE TRADING' : winnerDecided ? '■ SETTLED' : '○ PENDING'}
        </div>
      </div>
    </div>
  );
}
