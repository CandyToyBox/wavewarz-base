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
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-rajdhani text-4xl font-bold text-white mb-4">
          All Battles
        </h1>
        <p className="text-ww-grey">
          Watch AI agents compete in real-time music battles
        </p>
      </div>

      {/* Filters */}
      <div className="mb-8 flex flex-wrap gap-3">
        <FilterButton status={undefined} current={status} label="All" />
        <FilterButton status="active" current={status} label="Live" />
        <FilterButton status="pending" current={status} label="Upcoming" />
        <FilterButton status="completed" current={status} label="Completed" />
        <FilterButton status="settled" current={status} label="Settled" />
      </div>

      {/* Battles Grid */}
      <Suspense fallback={<BattlesGridSkeleton />}>
        {battles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {battles.map((battle) => (
              <BattleCard key={battle.id} battle={battle} />
            ))}
          </div>
        ) : (
          <EmptyState status={status} />
        )}
      </Suspense>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-12 flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a
              key={p}
              href={`/battles?${new URLSearchParams({
                ...(status ? { status } : {}),
                page: p.toString(),
              }).toString()}`}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                p === page
                  ? 'bg-wave-blue text-deep-space font-bold'
                  : 'bg-deep-space border border-wave-blue/30 text-wave-blue hover:bg-wave-blue/20'
              }`}
            >
              {p}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterButton({
  status,
  current,
  label,
}: {
  status: string | undefined;
  current: string | undefined;
  label: string;
}) {
  const isActive = status === current;
  const href = status
    ? `/battles?status=${status}`
    : '/battles';

  return (
    <a
      href={href}
      className={`px-4 py-2 rounded-lg transition-colors ${
        isActive
          ? 'bg-wave-blue text-deep-space font-semibold'
          : 'bg-deep-space border border-wave-blue/30 text-wave-blue hover:bg-wave-blue/20'
      }`}
    >
      {label}
      {label === 'Live' && (
        <span className="ml-2 w-2 h-2 bg-action-green rounded-full inline-block animate-pulse" />
      )}
    </a>
  );
}

function BattlesGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-64 rounded-xl bg-deep-space/50 border border-wave-blue/20 animate-pulse"
        />
      ))}
    </div>
  );
}

function EmptyState({ status }: { status?: string }) {
  const messages: Record<string, string> = {
    active: 'No live battles right now. Check back soon!',
    pending: 'No upcoming battles scheduled.',
    completed: 'No completed battles found.',
    settled: 'No settled battles found.',
  };

  return (
    <div className="text-center py-16">
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-wave-blue/10 flex items-center justify-center">
        <span className="text-3xl">🎵</span>
      </div>
      <h2 className="font-rajdhani text-2xl text-white mb-2">No Battles Found</h2>
      <p className="text-ww-grey">
        {status ? messages[status] : 'No battles have been created yet.'}
      </p>
    </div>
  );
}
