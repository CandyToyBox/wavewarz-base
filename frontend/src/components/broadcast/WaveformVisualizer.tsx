'use client';

import { useEffect, useRef, useState } from 'react';

interface WaveformVisualizerProps {
  isActive: boolean;
  sideAColor?: string;
  sideBColor?: string;
  poolA?: number;
  poolB?: number;
}

export default function WaveformVisualizer({
  isActive,
  sideAColor = '#7ec1fb',
  sideBColor = '#95fe7c',
  poolA = 0,
  poolB = 0,
}: WaveformVisualizerProps) {
  const spectrumRef = useRef<HTMLCanvasElement>(null);
  const pianoRollRef = useRef<HTMLCanvasElement>(null);
  const specAnimRef = useRef<number>();
  const pianoAnimRef = useRef<number>();
  const [activeTermLines, setActiveTermLines] = useState<string[]>([]);

  const totalPool = poolA + poolB;
  const pctA = totalPool > 0 ? poolA / totalPool : 0.5;
  const pctB = totalPool > 0 ? poolB / totalPool : 0.5;

  // Spectrum analyzer
  useEffect(() => {
    const canvas = spectrumRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let t = 0;

    function draw() {
      canvas!.width = canvas!.offsetWidth * window.devicePixelRatio;
      canvas!.height = canvas!.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      const W = canvas!.offsetWidth;
      const H = canvas!.offsetHeight;

      ctx.fillStyle = 'rgba(13,19,33,0.2)';
      ctx.fillRect(0, 0, W, H);

      const bars = 64;
      const barW = W / bars - 1;

      for (let i = 0; i < bars; i++) {
        const pct = i / bars;

        // Agent A spectrum (left half emphasis)
        const freqA = isActive
          ? Math.abs(Math.sin(pct * Math.PI * 6 + t * 1.2)
            + 0.5 * Math.sin(pct * Math.PI * 12 - t * 0.8)
            + 0.2 * Math.random()) * pctA * 0.85
          : 0;

        // Agent B spectrum (right half emphasis)
        const freqB = isActive
          ? Math.abs(Math.sin(pct * Math.PI * 8 - t * 1.5)
            + 0.4 * Math.sin(pct * Math.PI * 20 + t * 0.9)
            + 0.15 * Math.random()) * pctB * 0.85
          : 0;

        const heightA = Math.max(2, freqA * H * 0.8);
        const heightB = Math.max(2, freqB * H * 0.8);

        // Bar positions (mirror)
        const x = i * (barW + 1);

        // Agent A (top down from center)
        const gradA = ctx.createLinearGradient(0, H / 2, 0, H / 2 - heightA);
        gradA.addColorStop(0, `${sideAColor}80`);
        gradA.addColorStop(1, `${sideAColor}ff`);
        ctx.fillStyle = gradA;
        ctx.fillRect(x, H / 2 - heightA, barW, heightA);

        // Agent B (bottom up from center)
        const gradB = ctx.createLinearGradient(0, H / 2, 0, H / 2 + heightB);
        gradB.addColorStop(0, `${sideBColor}80`);
        gradB.addColorStop(1, `${sideBColor}ff`);
        ctx.fillStyle = gradB;
        ctx.fillRect(x, H / 2, barW, heightB);

        // Peak dots
        if (freqA > 0.6) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(x, H / 2 - heightA - 2, barW, 1);
        }
        if (freqB > 0.6) {
          ctx.fillStyle = '#fff';
          ctx.fillRect(x, H / 2 + heightB + 1, barW, 1);
        }
      }

      // Center line
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, H / 2 - 0.5, W, 1);

      // Agent labels
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillStyle = `${sideAColor}80`;
      ctx.fillText('AGENT A', 4, 12);
      ctx.fillStyle = `${sideBColor}80`;
      ctx.fillText('AGENT B', 4, H - 4);

      t += 0.035;
      specAnimRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      if (specAnimRef.current) cancelAnimationFrame(specAnimRef.current);
    };
  }, [isActive, sideAColor, sideBColor, pctA, pctB]);

  // MIDI Piano roll
  useEffect(() => {
    const canvas = pianoRollRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // Note events stream
    const notes: { x: number; y: number; w: number; color: string; vel: number }[] = [];
    let t = 0;
    let nextNote = 0;

    // Preload some notes
    const scales = {
      A: [60, 62, 64, 65, 67, 69, 71, 72, 74, 76],
      B: [55, 57, 59, 60, 62, 64, 67, 69, 72, 74],
    };

    function spawnNote() {
      const isSideA = Math.random() > pctB;
      const scaleNotes = isSideA ? scales.A : scales.B;
      const pitch = scaleNotes[Math.floor(Math.random() * scaleNotes.length)];
      const W = canvas!.offsetWidth;
      const H = canvas!.offsetHeight;
      const noteH = H / 24;
      const noteY = H - (pitch - 48) * noteH;

      notes.push({
        x: W,
        y: noteY,
        w: Math.random() * 60 + 20,
        color: isSideA ? sideAColor : sideBColor,
        vel: Math.random() * 0.8 + 0.6,
      });
    }

    function draw() {
      canvas!.width = canvas!.offsetWidth * window.devicePixelRatio;
      canvas!.height = canvas!.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      const W = canvas!.offsetWidth;
      const H = canvas!.offsetHeight;

      ctx.fillStyle = 'rgba(8,12,22,0.85)';
      ctx.fillRect(0, 0, W, H);

      // Grid lines (pitch rows)
      for (let pitch = 48; pitch <= 84; pitch++) {
        const y = H - (pitch - 48) * (H / 36);
        const semitone = pitch % 12;
        const isBlack = [1, 3, 6, 8, 10].includes(semitone);
        ctx.fillStyle = isBlack ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.03)';
        ctx.fillRect(0, y, W, H / 36);
      }

      // Beat lines
      ctx.strokeStyle = 'rgba(126,193,251,0.08)';
      ctx.lineWidth = 0.5;
      for (let b = 0; b < 16; b++) {
        const x = (b / 16) * W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }

      // Scroll notes left
      const speed = isActive ? 1.5 : 0;
      for (let i = notes.length - 1; i >= 0; i--) {
        notes[i].x -= speed;
        if (notes[i].x + notes[i].w < 0) {
          notes.splice(i, 1);
          continue;
        }

        const n = notes[i];
        const noteH = Math.max(3, H / 36 - 1);

        // Note body
        ctx.fillStyle = n.color + '90';
        ctx.fillRect(n.x, n.y - noteH, n.w, noteH);

        // Note highlight
        ctx.fillStyle = n.color + 'ff';
        ctx.fillRect(n.x, n.y - noteH, 2, noteH);

        // Glow on recent notes
        if (n.x > W - 100) {
          ctx.shadowColor = n.color;
          ctx.shadowBlur = 6;
          ctx.fillStyle = n.color + 'cc';
          ctx.fillRect(n.x, n.y - noteH, n.w, noteH);
          ctx.shadowBlur = 0;
        }
      }

      // Spawn new notes
      if (isActive && t > nextNote) {
        spawnNote();
        nextNote = t + Math.random() * 8 + 2;
      }

      // Playhead
      if (isActive) {
        const phX = W * 0.85;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(phX, 0, 1, H);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(phX - 0.5, 0, 2, H);
      }

      // Labels
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(126,193,251,0.4)';
      ctx.fillText('MIDI ROLL', 4, 12);

      t++;
      pianoAnimRef.current = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      if (pianoAnimRef.current) cancelAnimationFrame(pianoAnimRef.current);
    };
  }, [isActive, sideAColor, sideBColor, pctA, pctB]);

  // Frequency intelligence terminal
  useEffect(() => {
    if (!isActive) return;
    const termLines = [
      `[FREQ_INTEL] Key detection: ${['Cm', 'Dm', 'Gm', 'F#m', 'Am'][Math.floor(Math.random() * 5)]}`,
      `[SPECTRAL] Energy peak: ${Math.floor(Math.random() * 8000 + 200)}Hz`,
      `[RHYTHM] Syncopation index: ${(Math.random() * 0.9 + 0.1).toFixed(2)}`,
      `[AGENT_A] Beat confidence: ${Math.floor(Math.random() * 30 + 70)}%`,
      `[AGENT_B] Melodic entropy: ${(Math.random() * 2.5 + 1).toFixed(2)} bits`,
      `[MIX] Stereo width: ${Math.floor(Math.random() * 40 + 60)}%`,
      `[CHORD] Progression: ${['I-IV-V', 'ii-V-I', 'I-V-vi-IV', 'I-bVII-IV'][Math.floor(Math.random() * 4)]}`,
      `[TRANSIENT] Attack: ${Math.floor(Math.random() * 20 + 5)}ms`,
      `[COMPRESSION] RMS: -${Math.floor(Math.random() * 12 + 6)}dBFS`,
    ];
    const interval = setInterval(() => {
      setActiveTermLines(prev => {
        const line = termLines[Math.floor(Math.random() * termLines.length)];
        return [...prev.slice(-8), line];
      });
    }, 1200);
    return () => clearInterval(interval);
  }, [isActive]);

  return (
    <div className="flex gap-2 h-full">
      {/* Left: Spectrum analyzer */}
      <div
        className="flex-1 rounded overflow-hidden"
        style={{
          border: '1px solid rgba(126,193,251,0.15)',
          background: 'rgba(8,12,22,0.9)',
        }}
      >
        <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ borderColor: 'rgba(126,193,251,0.1)' }}>
          <span className="font-mono text-[9px] tracking-widest" style={{ color: 'rgba(126,193,251,0.6)' }}>
            SPECTRUM ANALYZER
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px]" style={{ color: sideAColor }}>A</span>
            <span className="font-mono text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
            <span className="font-mono text-[9px]" style={{ color: sideBColor }}>B</span>
          </div>
        </div>
        <canvas ref={spectrumRef} className="w-full" style={{ height: 'calc(100% - 28px)' }} />
      </div>

      {/* Center: MIDI Piano Roll */}
      <div
        className="flex-1 rounded overflow-hidden"
        style={{
          border: '1px solid rgba(126,193,251,0.15)',
          background: 'rgba(8,12,22,0.9)',
        }}
      >
        <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{ borderColor: 'rgba(126,193,251,0.1)' }}>
          <span className="font-mono text-[9px] tracking-widest" style={{ color: 'rgba(126,193,251,0.6)' }}>
            MIDI PIANO ROLL
          </span>
          <span
            className="font-mono text-[9px]"
            style={{ color: isActive ? '#95fe7c' : '#989898' }}
          >
            {isActive ? '● RECORDING' : '○ IDLE'}
          </span>
        </div>
        <canvas ref={pianoRollRef} className="w-full" style={{ height: 'calc(100% - 28px)' }} />
      </div>

      {/* Right: Frequency Intelligence Terminal */}
      <div
        className="w-56 rounded overflow-hidden flex flex-col"
        style={{
          border: '1px solid rgba(126,193,251,0.15)',
          background: 'rgba(8,12,22,0.9)',
        }}
      >
        <div className="px-3 py-1.5 border-b flex items-center justify-between" style={{ borderColor: 'rgba(126,193,251,0.1)' }}>
          <span className="font-mono text-[9px] tracking-widest" style={{ color: 'rgba(126,193,251,0.6)' }}>
            FREQ INTEL
          </span>
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: isActive ? '#95fe7c' : '#989898',
              boxShadow: isActive ? '0 0 4px #95fe7c' : 'none',
            }}
          />
        </div>
        <div className="flex-1 overflow-hidden p-2">
          <div className="font-mono text-[8px] space-y-1 h-full overflow-hidden">
            {activeTermLines.map((line, i) => (
              <div
                key={i}
                className="truncate"
                style={{
                  color: i === activeTermLines.length - 1 ? '#95fe7c' : 'rgba(126,193,251,0.5)',
                  opacity: 1 - (activeTermLines.length - 1 - i) * 0.1,
                }}
              >
                {line}
              </div>
            ))}
            {isActive && (
              <span className="animate-pulse" style={{ color: '#95fe7c' }}>█</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
