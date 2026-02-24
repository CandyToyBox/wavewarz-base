/**
 * WaveWarz Sound Engine
 * Web Audio API — atmospheric, not arcade
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setEnabled(v: boolean) {
    this.enabled = v;
  }

  /** Short synth tick on each trade */
  tradeTick(side: 'A' | 'B') {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const freq = side === 'A' ? 660 : 880;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.8, ctx.currentTime + 0.06);

      filter.type = 'highpass';
      filter.frequency.value = 400;

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  }

  /** Vinyl scratch reverse on NFT mint */
  nftMint() {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const bufSize = Math.floor(ctx.sampleRate * 0.4);
      const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Reverse-scratch: noise that sweeps up
      for (let i = 0; i < bufSize; i++) {
        const t = i / bufSize;
        const env = Math.sin(t * Math.PI);
        data[i] = (Math.random() * 2 - 1) * env * 0.3;
      }

      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      source.buffer = buffer;
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(500, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(4000, ctx.currentTime + 0.4);
      filter.Q.value = 3;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = 0.25;

      source.start();

      // Chime after scratch
      const chime = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chime.type = 'sine';
      chime.frequency.value = 1047;
      chime.connect(chimeGain);
      chimeGain.connect(ctx.destination);
      chimeGain.gain.setValueAtTime(0, ctx.currentTime + 0.35);
      chimeGain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.4);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
      chime.start(ctx.currentTime + 0.35);
      chime.stop(ctx.currentTime + 0.9);
    } catch {}
  }

  /** Soft robotic click on agent decision */
  agentDecision() {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const bufSize = Math.floor(ctx.sampleRate * 0.025);
      const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize) * 0.15;
      }
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      source.buffer = buffer;
      filter.type = 'highpass';
      filter.frequency.value = 2000;
      source.connect(filter);
      filter.connect(ctx.destination);
      source.start();
    } catch {}
  }

  /** Bass pulse on timer < 10s */
  timerPulse() {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 55;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }

  /** Static burst → winner chime on battle end */
  battleEnd(winnerSide: 'A' | 'B') {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();

      // Static burst
      const bufSize = Math.floor(ctx.sampleRate * 0.35);
      const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        const env = 1 - i / bufSize;
        data[i] = (Math.random() * 2 - 1) * env * 0.25;
      }
      const noise = ctx.createBufferSource();
      const noiseFilter = ctx.createBiquadFilter();
      const noiseGain = ctx.createGain();
      noise.buffer = buffer;
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 2000;
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noiseGain.gain.value = 0.3;
      noise.start(ctx.currentTime);

      // Triumphant chime sequence
      const freqs = winnerSide === 'A'
        ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
        : [392, 523.25, 659.25, 783.99, 1046.5];

      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const t = ctx.currentTime + 0.35 + i * 0.09;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
        osc.start(t);
        osc.stop(t + 0.7);
      });
    } catch {}
  }

  /** Broadcast boot sound */
  broadcastBoot() {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      [80, 160, 320, 640].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(ctx.destination);
        const t = ctx.currentTime + i * 0.15;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.06, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    } catch {}
  }
}

export const soundEngine = typeof window !== 'undefined' ? new SoundEngine() : null;
export default SoundEngine;
