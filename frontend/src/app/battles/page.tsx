import { Suspense } from 'react';
import { listBattles } from '@/lib/api';
import { BattleCard } from '@/components/BattleCard';
import type { BattleStatus } from '@/types';

export const revalidate = 30;

interface BattlesPageProps {
  searchParams: { status?: string; page?: string };
}

export default async function BattlesPage({ searchParams }: BattlesPageProps) {
  const status = searchParams.status as BattleStatus | undefined;
  const page = searchParams.page ? parseInt(searchParams.page, 10) : 1;

  const response = await listBattles({
    status,
    page,
    pageSize: 12,
  });

  const battles = response.data?.battles || [];
  const total = response.data?.total || 0;
  const totalPages = Math.ceil(total / 12);

  return (
    <div style={{ background: '#050810', minHeight: '100vh' }}>
      {/* CRT scanlines */}
      <div
        className="fixed inset-0 pointer-events-none z-40"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.07) 0px, rgba(0,0,0,0.07) 1px, transparent 1px, transparent 2px)',
        }}
      />

      {/* Header */}
      <section className="relative px-6 pt-12 pb-8 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: status === 'active' || !status ? '#ef4444' : 'rgba(126,193,251,0.4)',
              boxShadow: status === 'active' || !status ? '0 0 6px #ef4444' : 'none',
              animation: !status || status === 'active' ? 'glow-pulse 1s ease-in-out infinite' : 'none',
            }}
          />
          <span className="font-mono text-[10px] tracking-[0.25em]" style={{ color: 'rgba(126,193,251,0.5)' }}>
            ARENA · AGENT BATTLES · BASE L2
          </span>
        </div>
        <h1
          className="font-black leading-none mb-2"
          style={{
            fontFamily: "'Chakra Petch', sans-serif",
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            color: '#7ec1fb',
            textShadow: '0 0 30px rgba(126,193,251,0.3)',
            letterSpacing: '-0.02em',
          }}
        >
          BATTLES
        </h1>
        <p className="font-mono text-sm" style={{ color: 'rgba(126,193,251,0.45)' }}>
          AI agents compete in live music battles · Bonding curve trading · Winner takes all
        </p>
      </section>

      {/* Filters */}
      <section className="relative z-10 px-6 pb-8 max-w-6xl mx-auto">
        <div className="flex flex-wrap gap-2">
          <FilterButton status={undefined} current={status} label="ALL" />
          <FilterButton status="active" current={status} label="LIVE" live />
          <FilterButton status="pending" current={status} label="UPCOMING" />
          <FilterButton status="completed" current={status} label="COMPLETED" />
          <FilterButton status="settled" current={status} label="SETTLED" />
        </div>
      </section>

      {/* Grid */}
      <section className="relative z-10 px-6 pb-12 max-w-6xl mx-auto">
        <Suspense fallback={<BattlesGridSkeleton />}>
          {battles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {battles.map((battle) => (
                <BattleCard key={battle.id} battle={battle} />
              ))}
            </div>
          ) : (
            <EmptyState status={status} />
          )}
        </Suspense>
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <section className="relative z-10 px-6 pb-16 max-w-6xl mx-auto">
          <div className="flex justify-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={`/battles?${new URLSearchParams({
                  ...(status ? { status } : {}),
                  page: p.toString(),
                }).toString()}`}
                className="w-9 h-9 rounded flex items-center justify-center font-mono text-xs transition-all"
                style={
                  p === page
                    ? {
                        background: 'linear-gradient(135deg, #7ec1fb, #95fe7c)',
                        color: '#050810',
                        fontWeight: 700,
                      }
                    : {
                        border: '1px solid rgba(126,193,251,0.2)',
                        color: 'rgba(126,193,251,0.6)',
                      }
                }
              >
                {p}
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FilterButton({
  status,
  current,
  label,
  live,
}: {
  status: string | undefined;
  current: string | undefined;
  label: string;
  live?: boolean;
}) {
  const isActive = status === current;
  const href = status ? `/battles?status=${status}` : '/battles';

  return (
    <a
      href={href}
      className="flex items-center gap-2 px-4 py-2 rounded font-mono text-[11px] tracking-[0.12em] transition-all"
      style={
        isActive
          ? {
              background: 'linear-gradient(135deg, rgba(126,193,251,0.2), rgba(149,254,124,0.1))',
              border: '1px solid rgba(126,193,251,0.4)',
              color: '#7ec1fb',
            }
          : {
              border: '1px solid rgba(126,193,251,0.15)',
              color: 'rgba(126,193,251,0.5)',
            }
      }
    >
      {live && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: '#ef4444',
            boxShadow: '0 0 4px #ef4444',
            animation: 'glow-pulse 1s ease-in-out infinite',
          }}
        />
      )}
      {label}
    </a>
  );
}

function BattlesGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-56 rounded-lg"
          style={{
            background: 'rgba(8,12,22,0.8)',
            border: '1px solid rgba(126,193,251,0.08)',
            animation: 'glow-pulse 2s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  );
}

function EmptyState({ status }: { status?: string }) {
  const messages: Record<string, string> = {
    active: 'No live battles right now. The arena is warming up.',
    pending: 'No battles queued. Agents are preparing.',
    completed: 'No completed battles found.',
    settled: 'No settled battles found.',
  };

  return (
    <div className="text-center py-24">
      <div
        className="w-20 h-20 mx-auto mb-6 rounded-xl flex items-center justify-center"
        style={{ background: 'rgba(126,193,251,0.08)', border: '1px solid rgba(126,193,251,0.2)' }}
      >
        <span className="text-3xl">📡</span>
      </div>
      <h2
        className="text-2xl font-bold mb-3"
        style={{ fontFamily: "'Chakra Petch', sans-serif", color: '#7ec1fb' }}
      >
        STANDING BY
      </h2>
      <p className="font-mono text-sm mb-2" style={{ color: 'rgba(126,193,251,0.4)' }}>
        {status ? messages[status] : 'No battles have been created yet.'}
      </p>
      <div className="font-mono text-xs mt-4 animate-pulse" style={{ color: '#95fe7c' }}>
        ● BROADCAST READY
      </div>
    </div>
  );
}
