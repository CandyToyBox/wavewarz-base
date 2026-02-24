'use client';

import { useEffect, useState, useRef } from 'react';
import { soundEngine } from './SoundEngine';

interface IntroSequenceProps {
  onComplete: () => void;
}

const BOOT_LINES = [
  '> WAVEWARZ BROADCAST SYSTEM v2.4.1',
  '> Initializing neural audio engines...',
  '> Loading agent intelligence modules...',
  '> Connecting to Base L2 blockchain...',
  '> Battle feed: ONLINE',
  '> Audio visualization: READY',
  '> Trading charts: ACTIVE',
  '> ─────────────────────────────',
  '> BROADCAST LIVE',
];

export default function IntroSequence({ onComplete }: IntroSequenceProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [staticOpacity, setStaticOpacity] = useState(1);
  const [done, setDone] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>();

  // Animated static background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let frame = 0;
    function drawStatic() {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas!.width, canvas!.height);

      // Random pixel static
      const imgData = ctx.createImageData(canvas!.width, canvas!.height);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const val = Math.random() > 0.92 ? Math.floor(Math.random() * 120) : 0;
        imgData.data[i] = val * 0.3;     // R - slight blue tint
        imgData.data[i + 1] = val * 0.8; // G
        imgData.data[i + 2] = val;       // B
        imgData.data[i + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);

      // Horizontal scan line
      const scanY = (frame * 3) % canvas!.height;
      ctx.fillStyle = 'rgba(126, 193, 251, 0.15)';
      ctx.fillRect(0, scanY, canvas!.width, 2);

      frame++;
      animRef.current = requestAnimationFrame(drawStatic);
    }

    drawStatic();
    soundEngine?.broadcastBoot();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // Typewriter boot sequence
  useEffect(() => {
    let lineIdx = 0;
    let charIdx = 0;
    const currentLine = () => BOOT_LINES[lineIdx] || '';

    const timer = setInterval(() => {
      if (lineIdx >= BOOT_LINES.length) {
        clearInterval(timer);
        // Fade out
        setTimeout(() => {
          setStaticOpacity(0);
          setTimeout(() => {
            setDone(true);
            onComplete();
          }, 600);
        }, 400);
        return;
      }

      charIdx++;
      if (charIdx > currentLine().length) {
        lineIdx++;
        charIdx = 0;
        setLines(prev => [...prev]);
      } else {
        setLines(prev => {
          const next = [...prev];
          next[lineIdx] = currentLine().slice(0, charIdx);
          return next;
        });
      }
    }, 28);

    return () => clearInterval(timer);
  }, [onComplete]);

  if (done) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        opacity: staticOpacity,
        transition: 'opacity 0.6s ease-out',
        background: '#000',
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ opacity: 0.4 }}
      />

      {/* CRT overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 2px)',
      }} />

      <div className="relative z-10 max-w-2xl w-full px-8">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="font-mono text-xs text-wave-blue/60 mb-2 tracking-widest">
            ◄ SIGNAL DETECTED ►
          </div>
          <h1
            className="text-5xl font-black tracking-tight"
            style={{
              fontFamily: "'Chakra Petch', sans-serif",
              color: '#7ec1fb',
              textShadow: '0 0 30px rgba(126,193,251,0.8), 0 0 60px rgba(126,193,251,0.4)',
            }}
          >
            WAVE<span style={{ color: '#95fe7c', textShadow: '0 0 30px rgba(149,254,124,0.8)' }}>WARZ</span>
          </h1>
          <div className="font-mono text-xs text-action-green/80 mt-2 tracking-[0.3em]">
            BASE BROADCAST TERMINAL
          </div>
        </div>

        {/* Terminal window */}
        <div
          className="rounded border"
          style={{
            background: 'rgba(13,19,33,0.95)',
            borderColor: 'rgba(126,193,251,0.3)',
            boxShadow: '0 0 40px rgba(126,193,251,0.1), inset 0 0 40px rgba(0,0,0,0.5)',
          }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2 border-b"
            style={{ borderColor: 'rgba(126,193,251,0.2)' }}
          >
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
            <span className="font-mono text-xs text-wave-blue/60 ml-2">wavewarz-terminal — bash</span>
          </div>

          <div className="p-6 font-mono text-sm min-h-[280px]">
            {lines.map((line, i) => (
              <div
                key={i}
                className="mb-1"
                style={{
                  color: line?.includes('BROADCAST LIVE') ? '#95fe7c'
                    : line?.includes('ONLINE') || line?.includes('READY') || line?.includes('ACTIVE') ? '#95fe7c'
                    : line?.includes('──') ? 'rgba(126,193,251,0.4)'
                    : '#7ec1fb',
                  textShadow: line?.includes('BROADCAST LIVE')
                    ? '0 0 10px rgba(149,254,124,0.8)'
                    : 'none',
                  fontWeight: line?.includes('BROADCAST LIVE') ? 'bold' : 'normal',
                }}
              >
                {line}
                {i === lines.length - 1 && (
                  <span className="animate-pulse" style={{ color: '#95fe7c' }}>█</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="text-center mt-4 font-mono text-xs" style={{ color: 'rgba(126,193,251,0.4)' }}>
          WAVEWARZ BASE · AGENT MUSIC BATTLE NETWORK · EST. 2026
        </div>
      </div>
    </div>
  );
}
