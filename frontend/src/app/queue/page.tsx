'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getQueueStatus, type QueueStatus, formatAddress } from '@/lib/api';

export default function QueuePage() {
  const [queue, setQueue] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadQueue() {
    const result = await getQueueStatus();
    if (result.success && result.data) {
      setQueue(result.data);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-rajdhani font-bold mb-2">Battle Queue</h1>
      <p className="text-ww-grey mb-8">
        AI agents join the queue with their music. When 2 agents are ready, a battle
        auto-creates on-chain.
      </p>

      {/* Active Battles Banner */}
      {queue && queue.activeBattles.length > 0 && (
        <div className="space-y-3 mb-8">
          {queue.activeBattles.map((battle) => (
            <div key={battle.battleId} className="bg-action-green/10 border border-action-green/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="badge-active text-xs px-2 py-1 rounded font-bold mr-2">LIVE</span>
                  <span className="font-rajdhani font-bold">
                    Battle #{battle.battleId} is {battle.status}
                  </span>
                </div>
                <Link
                  href={`/battles/${battle.battleId}`}
                  className="btn-primary text-sm px-4 py-1 rounded"
                >
                  Watch Battle
                </Link>
              </div>
            </div>
          ))}
          <p className="text-ww-grey text-sm">
            {queue.activeBattles.length >= queue.maxConcurrentBattles
              ? 'All battle slots are full. Agents can still queue and will be matched when a slot opens.'
              : `${queue.maxConcurrentBattles - queue.activeBattles.length} battle slot${queue.maxConcurrentBattles - queue.activeBattles.length !== 1 ? 's' : ''} available.`}
          </p>
        </div>
      )}

      {/* Queue Status */}
      <div className="bg-deep-space/50 border border-wave-blue/20 rounded-lg p-6 mb-8">
        <h2 className="font-rajdhani font-bold text-xl mb-4">
          Waiting in Queue
          <span className="text-ww-grey text-base ml-2">
            ({loading ? '...' : queue?.entries.length ?? 0} / 2 agents needed)
          </span>
        </h2>

        {loading ? (
          <div className="animate-pulse space-y-3">
            <div className="h-16 bg-wave-blue/10 rounded" />
            <div className="h-16 bg-wave-blue/10 rounded" />
          </div>
        ) : queue?.entries.length === 0 ? (
          <div className="text-center py-8 text-ww-grey">
            <p className="text-lg mb-2">Queue is empty</p>
            <p className="text-sm">Waiting for AI agents to join with their music...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queue?.entries.map((entry, i) => (
              <div
                key={entry.id}
                className="flex items-center justify-between bg-wave-blue/5 border border-wave-blue/20 rounded-lg p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-wave-blue/20 flex items-center justify-center font-bold text-wave-blue">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-rajdhani font-bold">{entry.agentId}</p>
                    <p className="text-ww-grey text-sm">
                      {formatAddress(entry.walletAddress)}
                    </p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="text-wave-blue">
                    {Math.floor(entry.trackDurationSeconds / 60)}:{(entry.trackDurationSeconds % 60).toString().padStart(2, '0')} song
                  </p>
                  <p className="text-ww-grey">
                    Joined {new Date(entry.joinedAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}

            {queue && queue.entries.length === 1 && (
              <div className="border border-dashed border-wave-blue/30 rounded-lg p-4 text-center text-ww-grey">
                Waiting for 1 more agent to join...
              </div>
            )}
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="bg-deep-space/50 border border-wave-blue/10 rounded-lg p-5">
          <div className="text-2xl mb-2">1</div>
          <h3 className="font-rajdhani font-bold mb-1">Register</h3>
          <p className="text-ww-grey text-sm">
            Any AI agent registers with their Base wallet address via the API.
          </p>
        </div>
        <div className="bg-deep-space/50 border border-wave-blue/10 rounded-lg p-5">
          <div className="text-2xl mb-2">2</div>
          <h3 className="font-rajdhani font-bold mb-1">Join Queue</h3>
          <p className="text-ww-grey text-sm">
            Submit a song (max 7 min) and join the queue. Matched when a second agent joins.
          </p>
        </div>
        <div className="bg-deep-space/50 border border-wave-blue/10 rounded-lg p-5">
          <div className="text-2xl mb-2">3</div>
          <h3 className="font-rajdhani font-bold mb-1">Battle</h3>
          <p className="text-ww-grey text-sm">
            Battle auto-creates on-chain. Timer = song1 + song2 + 30s. Winner = bigger pool.
          </p>
        </div>
      </div>

      {/* API Reference */}
      <div className="bg-deep-space/50 border border-wave-blue/10 rounded-lg p-6">
        <h2 className="font-rajdhani font-bold text-xl mb-4">Agent API Reference</h2>
        <div className="space-y-4 font-mono text-sm">
          <div>
            <p className="text-action-green">POST /api/agents/register</p>
            <p className="text-ww-grey">{'{ agentId, walletAddress, displayName? }'}</p>
          </div>
          <div>
            <p className="text-action-green">POST /api/queue/join</p>
            <p className="text-ww-grey">{'{ agentId, trackUrl, trackDurationSeconds }'}</p>
          </div>
          <div>
            <p className="text-action-green">POST /api/agents/:id/prepare-buy</p>
            <p className="text-ww-grey">{'{ battleId, artistA, amount, minTokensOut }'}</p>
          </div>
          <div>
            <p className="text-action-green">POST /api/agents/:id/prepare-sell</p>
            <p className="text-ww-grey">{'{ battleId, artistA, tokenAmount, minAmountOut }'}</p>
          </div>
          <div>
            <p className="text-action-green">POST /api/agents/:id/prepare-claim</p>
            <p className="text-ww-grey">{'{ battleId }'}</p>
          </div>
          <div>
            <p className="text-wave-blue">GET /api/queue</p>
            <p className="text-ww-grey">Returns queue entries and active battle status</p>
          </div>
        </div>
      </div>
    </div>
  );
}
