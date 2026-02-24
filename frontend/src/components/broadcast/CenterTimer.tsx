'use client';

import { useEffect, useRef, useState } from 'react';
import { soundEngine } from './SoundEngine';

interface CenterTimerProps {
  endTime: string | null;
  startTime: string | null;
  isActive: boolean;
  winnerDecided: boolean;
}

export default function CenterTimer({ endTime, startTime, isActive, winnerDecided }: CenterTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(1);
  const [phase, setPhase] = useState<'green' | 'amber' | 'red'>('green');
  const [distort, setDistort] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>();
  const lastPulseRef = useRef(0);

  useEffect(() => {
    if (!startTime || !endTime) return;
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const total = Math.floor((end - start) / 1000);
    setTotalSeconds(total > 0 ? total : 1);
  }, [startTime, endTime]);

  useEffect(() => {
    if (!endTime || !isActive) return;

    const tick = () => {
      const now = Date.now();
      const end = new Date(endTime).getTime();
      const left = Math.max(0, Math.floor((end - now) / 1000));
      setSecondsLeft(left);

      if (left > 60) setPhase('green');
      else if (left > 10) setPhase('amber');
      else setPhase('red');

      // Bass pulse every second in last 10s
      if (left <= 10 && left > 0) {
        const sec = Math.floor(now / 1000);
        if (sec !== lastPulseRef.current) {
          lastPulseRef.current = sec;
          soundEngine?.timerPulse();
          setDistort(true);
          setTimeout(() => setDistort(false), 200);
        }
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [endTime, isActive]);

  const progress = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0;
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const phaseColor = phase === 'green' ? '#95fe7c' : phase === 'amber' ? '#f59e0b' : '#ef4444';
  const phaseGlow = phase === 'green'
    ? '0 0 20px rgba(149,254,124,0.6), 0 0 40px rgba(149,254,124,0.3)'
    : phase === 'amber'
    ? '0 0 20px rgba(245,158,11,0.6), 0 0 40px rgba(245,158,11,0.3)'
    : '0 0 20px rgba(239,68,68,0.8), 0 0 60px rgba(239,68,68,0.4)';

  // Draw waveform canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let t = 0;

    function draw() {
      canvas!.width = canvas!.offsetWidth;
      canvas!.height = canvas!.offsetHeight;
      const W = canvas!.width;
      const H = canvas!.height;

      ctx.clearRect(0, 0, W, H);

      // Draw waveform
      ctx.beginPath();
      ctx.strokeStyle = phaseColor;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = phaseColor;
      ctx.shadowBlur = 6;
      ctx.globalAlpha = 0.7;

      for (let x = 0; x < W; x++) {
        const pct = x / W;
        const amp = H * 0.3 * progress;
        // Multiple harmonics for organic waveform
        const y = H / 2
          + amp * Math.sin(pct * Math.PI * 8 + t * 2)
          + amp * 0.4 * Math.sin(pct * Math.PI * 16 + t * 3)
          + amp * 0.2 * Math.sin(pct * Math.PI * 32 - t * 1.5);

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      t += 0.04;
      animRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [phaseColor, progress]);

  const circumference = 2 * Math.PI * 56;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      {/* Label */}
      <div className="font-mono text-xs tracking-[0.3em] uppercase" style={{ color: 'rgba(126,193,251,0.6)' }}>
        {winnerDecided ? '◄ BATTLE ENDED ►' : isActive ? '◄ LIVE ►' : '◄ STANDBY ►'}
      </div>

      {/* Circular timer */}
      <div
        className="relative flex items-center justify-center"
        style={{
          filter: distort ? 'hue-rotate(30deg) brightness(1.5)' : 'none',
          transition: 'filter 0.1s',
        }}
      >
        {/* Outer ring glow */}
        <div
          className="absolute w-36 h-36 rounded-full"
          style={{
            background: `radial-gradient(circle, ${phaseColor}08 0%, transparent 70%)`,
            boxShadow: isActive ? phaseGlow : 'none',
            transition: 'box-shadow 0.5s',
          }}
        />

        {/* SVG clock */}
        <svg width={136} height={136} className="relative z-10" style={{ transform: 'rotate(-90deg)' }}>
          {/* Track */}
          <circle
            cx={68} cy={68} r={56}
            fill="none"
            stroke="rgba(126,193,251,0.1)"
            strokeWidth={4}
          />
          {/* Tick marks */}
          {Array.from({ length: 60 }).map((_, i) => {
            const angle = (i / 60) * Math.PI * 2;
            const inner = i % 5 === 0 ? 46 : 50;
            const outer = 58;
            const x1 = 68 + inner * Math.cos(angle);
            const y1 = 68 + inner * Math.sin(angle);
            const x2 = 68 + outer * Math.cos(angle);
            const y2 = 68 + outer * Math.sin(angle);
            return (
              <line
                key={i}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={i % 5 === 0 ? 'rgba(126,193,251,0.4)' : 'rgba(126,193,251,0.15)'}
                strokeWidth={i % 5 === 0 ? 1.5 : 0.75}
              />
            );
          })}
          {/* Progress arc */}
          <circle
            cx={68} cy={68} r={56}
            fill="none"
            stroke={phaseColor}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{
              filter: `drop-shadow(0 0 6px ${phaseColor})`,
              transition: 'stroke-dashoffset 0.5s linear, stroke 0.5s',
            }}
          />
        </svg>

        {/* Digital readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ transform: 'rotate(0deg)' }}>
          <span
            className="font-mono font-bold leading-none"
            style={{
              fontSize: '1.6rem',
              color: phaseColor,
              textShadow: phaseGlow,
              letterSpacing: '0.05em',
              fontFamily: "'JetBrains Mono', 'Courier New', monospace",
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {winnerDecided ? 'END' : timeStr}
          </span>
          {!winnerDecided && (
            <span className="font-mono text-[9px] mt-0.5" style={{ color: 'rgba(126,193,251,0.5)', letterSpacing: '0.2em' }}>
              REMAINING
            </span>
          )}
        </div>
      </div>

      {/* Waveform embed */}
      <div
        className="w-36 h-8 rounded"
        style={{
          background: 'rgba(13,19,33,0.8)',
          border: `1px solid ${phaseColor}30`,
          overflow: 'hidden',
        }}
      >
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {/* Phase indicator dots */}
      <div className="flex items-center gap-1.5">
        {['green', 'amber', 'red'].map((p) => (
          <div
            key={p}
            className="w-1.5 h-1.5 rounded-full transition-all duration-300"
            style={{
              background: p === phase ? phaseColor : 'rgba(255,255,255,0.15)',
              boxShadow: p === phase ? `0 0 6px ${phaseColor}` : 'none',
            }}
          />
        ))}
      </div>

      {/* Round indicator */}
      <div className="font-mono text-[10px] tracking-widest" style={{ color: 'rgba(126,193,251,0.4)' }}>
        ROUND 1 OF 1
      </div>
    </div>
  );
}
