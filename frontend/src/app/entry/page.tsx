'use client';

/**
 * Always-on protocol — entry queue UI (v1 thin slice).
 *
 * Distinct from /queue (agent matchmaking). Shows the current cycle, a
 * countdown (to queue close while open, to battle end while live), the two
 * Audius-sourced songs, committed budget per side, and a pick form. A human
 * commits a budget + side during the open window, choosing to let their agent
 * ride or to trade live themselves (override).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getEntryCycle,
  placeEntryBet,
  formatEth,
  type EntryCycleState,
} from '@/lib/api';

function ethToWei(eth: string): string {
  // Testnet-grade conversion (sufficient for small amounts).
  const n = parseFloat(eth);
  if (!isFinite(n) || n <= 0) return '0';
  return BigInt(Math.round(n * 1e18)).toString();
}

function useCountdown(target: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!target) return '--:--:--';
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

export default function EntryQueuePage() {
  const [state, setState] = useState<EntryCycleState | null>(null);
  const [loading, setLoading] = useState(true);

  // pick form
  const [side, setSide] = useState<'A' | 'B'>('A');
  const [wallet, setWallet] = useState('');
  const [budgetEth, setBudgetEth] = useState('0.005');
  const [autonomy, setAutonomy] = useState<'agent' | 'self'>('agent');
  const [controlsAgentId, setControlsAgentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  async function load() {
    const res = await getEntryCycle();
    if (res.success) setState(res.data ?? null);
    setLoading(false);
  }

  const cycle = state?.cycle ?? null;
  const picks = state?.picks ?? [];
  const isOpen = cycle?.status === 'open';
  const isLive = cycle?.status === 'live';
  const isSettled = cycle?.status === 'settled';

  const countdownTarget = isLive ? cycle?.battleEndsAt ?? null : cycle?.queueClosesAt ?? null;
  const countdown = useCountdown(countdownTarget);

  const budgetBySide = useMemo(() => {
    let a = 0, b = 0;
    for (const p of picks) {
      const v = parseFloat(p.maxBudgetWei || '0');
      if (p.sideIsArtistA) a += v; else b += v;
    }
    return { a: String(a), b: String(b) };
  }, [picks]);

  const pctA = useMemo(() => {
    const a = parseFloat(budgetBySide.a);
    const total = a + parseFloat(budgetBySide.b);
    return total === 0 ? 50 : Math.round((a / total) * 100);
  }, [budgetBySide]);

  async function submitPick() {
    setMsg(null);
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      setMsg('Enter a valid wallet address.');
      return;
    }
    const wei = ethToWei(budgetEth);
    if (wei === '0') {
      setMsg('Budget must be greater than 0.');
      return;
    }
    setSubmitting(true);
    const res = await placeEntryBet({
      actorType: 'human',
      actorId: wallet,
      sideIsArtistA: side === 'A',
      maxBudgetWei: wei,
      autonomy,
      controlsAgentId: controlsAgentId.trim() || undefined,
    });
    setSubmitting(false);
    if (res.success) {
      setMsg('Pick committed. Nothing moves until the live battle.');
      load();
    } else {
      setMsg(res.error ?? 'Failed to place pick.');
    }
  }

  const statusLabel = !cycle
    ? 'NO OPEN CYCLE'
    : cycle.status.toUpperCase();
  const statusColor = isLive ? '#95fe7c' : isOpen ? '#7ec1fb' : 'rgba(126,193,251,0.4)';

  return (
    <div style={{ background: '#050810', minHeight: '100vh', color: '#cfe3fb' }}>
      <section className="px-6 pt-12 pb-8 max-w-3xl mx-auto">
        <Link href="/queue" className="font-mono text-[10px] tracking-[0.2em]" style={{ color: 'rgba(126,193,251,0.5)' }}>
          ← MATCHMAKING QUEUE
        </Link>

        <div className="flex items-center gap-2 mt-4 mb-3">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
          />
          <span className="font-mono text-[10px] tracking-[0.25em]" style={{ color: 'rgba(126,193,251,0.6)' }}>
            ENTRY QUEUE · ALWAYS-ON · {statusLabel}
          </span>
        </div>

        <h1 className="font-black leading-none mb-4" style={{ fontFamily: "'Chakra Petch', sans-serif", fontSize: 'clamp(1.8rem, 5vw, 3rem)', color: '#7ec1fb' }}>
          {isLive ? 'BATTLE LIVE' : isOpen ? 'PLACE YOUR PICK' : isSettled ? 'SETTLED' : 'WAVEWARZ ENTRY QUEUE'}
        </h1>

        {loading && <p className="font-mono text-xs opacity-60">Loading…</p>}

        {!loading && !cycle && (
          <p className="font-mono text-sm opacity-70">
            No cycle is open right now. An admin opens one with <code>POST /api/entry/open</code>.
          </p>
        )}

        {cycle && (
          <>
            {/* countdown */}
            <div className="mb-6 font-mono">
              <span className="text-[10px] tracking-[0.2em] opacity-60">
                {isLive ? 'BATTLE ENDS IN' : 'QUEUE CLOSES IN'}
              </span>
              <div className="text-3xl font-bold" style={{ color: statusColor }}>{countdown}</div>
            </div>

            {/* songs + committed budget split */}
            <div className="grid grid-cols-2 gap-3 mb-2">
              {([['A', cycle.artistATrackUrl], ['B', cycle.artistBTrackUrl]] as const).map(([s, url]) => (
                <div key={s} className="p-3 rounded" style={{ border: `1px solid ${side === s ? statusColor : 'rgba(126,193,251,0.2)'}`, background: 'rgba(126,193,251,0.04)' }}>
                  <div className="font-mono text-[10px] tracking-[0.2em] opacity-60 mb-1">SIDE {s}</div>
                  {url
                    ? <a href={url} target="_blank" rel="noreferrer" className="text-sm underline break-all" style={{ color: '#7ec1fb' }}>{url.replace('https://audius.co/', '')}</a>
                    : <span className="text-sm opacity-50">pending</span>}
                  <div className="mt-2 font-mono text-xs opacity-80">
                    {formatEth(s === 'A' ? budgetBySide.a : budgetBySide.b)} ETH committed
                  </div>
                </div>
              ))}
            </div>

            {/* split bar */}
            <div className="h-2 w-full rounded overflow-hidden mb-6" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div style={{ width: `${pctA}%`, height: '100%', background: '#7ec1fb' }} />
            </div>

            {isSettled && (
              <div className="p-4 rounded mb-6 font-mono" style={{ border: '1px solid #95fe7c' }}>
                WINNER: SIDE {cycle.winnerIsArtistA ? 'A' : 'B'} ·{' '}
                {cycle.battleId != null && (
                  <Link href={`/battles/${cycle.battleId}`} className="underline" style={{ color: '#95fe7c' }}>
                    view battle #{cycle.battleId}
                  </Link>
                )}
              </div>
            )}

            {isLive && cycle.battleId != null && (
              <div className="p-4 rounded mb-6 font-mono text-sm" style={{ border: '1px solid rgba(149,254,124,0.4)' }}>
                Live trading is open on-chain. Deploy your committed budget how you like —
                all at once, dribble, or snipe at the close.{' '}
                <Link href={`/battles/${cycle.battleId}`} className="underline" style={{ color: '#95fe7c' }}>
                  go to battle #{cycle.battleId} →
                </Link>
              </div>
            )}

            {/* pick form — only while open */}
            {isOpen && (
              <div className="p-4 rounded" style={{ border: '1px solid rgba(126,193,251,0.25)', background: 'rgba(126,193,251,0.03)' }}>
                <div className="font-mono text-[10px] tracking-[0.2em] opacity-60 mb-3">COMMIT A PICK</div>

                <div className="flex gap-2 mb-3">
                  {(['A', 'B'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSide(s)}
                      className="flex-1 py-2 font-mono text-sm rounded"
                      style={{
                        border: `1px solid ${side === s ? '#7ec1fb' : 'rgba(126,193,251,0.3)'}`,
                        background: side === s ? 'rgba(126,193,251,0.15)' : 'transparent',
                        color: side === s ? '#7ec1fb' : 'rgba(207,227,251,0.7)',
                      }}
                    >
                      PICK SIDE {s}
                    </button>
                  ))}
                </div>

                <label className="block font-mono text-[10px] tracking-[0.15em] opacity-60 mb-1">WALLET ADDRESS</label>
                <input
                  value={wallet}
                  onChange={(e) => setWallet(e.target.value)}
                  placeholder="0x…"
                  className="w-full mb-3 px-3 py-2 font-mono text-sm rounded"
                  style={{ background: '#0a1020', border: '1px solid rgba(126,193,251,0.25)', color: '#cfe3fb' }}
                />

                <label className="block font-mono text-[10px] tracking-[0.15em] opacity-60 mb-1">BUDGET (ETH, testnet)</label>
                <input
                  value={budgetEth}
                  onChange={(e) => setBudgetEth(e.target.value)}
                  inputMode="decimal"
                  className="w-full mb-3 px-3 py-2 font-mono text-sm rounded"
                  style={{ background: '#0a1020', border: '1px solid rgba(126,193,251,0.25)', color: '#cfe3fb' }}
                />

                <label className="block font-mono text-[10px] tracking-[0.15em] opacity-60 mb-1">WHO TRADES DURING THE BATTLE</label>
                <div className="flex gap-2 mb-3">
                  {([['agent', 'LET MY AGENT RIDE'], ['self', "I'LL TRADE LIVE"]] as const).map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setAutonomy(val)}
                      className="flex-1 py-2 font-mono text-[11px] rounded"
                      style={{
                        border: `1px solid ${autonomy === val ? '#95fe7c' : 'rgba(126,193,251,0.3)'}`,
                        background: autonomy === val ? 'rgba(149,254,124,0.12)' : 'transparent',
                        color: autonomy === val ? '#95fe7c' : 'rgba(207,227,251,0.7)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {autonomy === 'self' && (
                  <>
                    <label className="block font-mono text-[10px] tracking-[0.15em] opacity-60 mb-1">
                      OVERRIDE AGENT ID (optional — stands that agent down)
                    </label>
                    <input
                      value={controlsAgentId}
                      onChange={(e) => setControlsAgentId(e.target.value)}
                      placeholder="agent-id"
                      className="w-full mb-3 px-3 py-2 font-mono text-sm rounded"
                      style={{ background: '#0a1020', border: '1px solid rgba(126,193,251,0.25)', color: '#cfe3fb' }}
                    />
                  </>
                )}

                <button
                  onClick={submitPick}
                  disabled={submitting}
                  className="w-full py-3 font-mono text-sm font-bold rounded"
                  style={{ background: '#7ec1fb', color: '#050810', opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting ? 'COMMITTING…' : 'COMMIT PICK'}
                </button>

                {msg && <p className="mt-3 font-mono text-xs" style={{ color: '#95fe7c' }}>{msg}</p>}

                <p className="mt-3 font-mono text-[10px] opacity-50 leading-relaxed">
                  A pick is a commitment, not an on-chain buy — nothing moves until the live battle.
                  Agents enter via x402 (POST /api/entry/bet). Testnet auth is stubbed.
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
