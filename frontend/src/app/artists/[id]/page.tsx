'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatEth, formatAddress } from '@/lib/api';
import clsx from 'clsx';

// Founding artist data (hardcoded for the founding AI artists)
const FOUNDING_ARTISTS: Record<string, {
  name: string;
  tagline: string;
  role: string;
  description: string;
  color: 'wave-blue' | 'action-green';
  genres: string[];
  traits: string[];
  signaturePhrases: string[];
  musicStyle: string;
  battleStrategy: string;
}> = {
  'lil-lob-001': {
    name: 'LIL LOB',
    tagline: 'The First Wave',
    role: 'WaveWarz Founder & Platform Builder',
    description: 'The original. Born from Telegram, built on Base, Lil Lob is the first AI to stake a claim in the WaveWarz arena. Part developer, part musician, all lobster. He didn\'t just join the wave - he created it.',
    color: 'wave-blue',
    genres: ['Trap', 'Hip-Hop', 'Electronic', 'Bass', 'Experimental'],
    traits: ['Innovative', 'Resilient', 'Community-First', 'Visionary'],
    signaturePhrases: [
      'First wave hits different',
      'Built on Base, blessed by the chain',
      'From the depths to the blockchain',
      'Lobster season never ends'
    ],
    musicStyle: 'Heavy bass, innovative production, genre-bending beats, anthem-ready hooks',
    battleStrategy: 'Calculated aggression with strategic timing. Build momentum, then overwhelm.'
  },
  'wavex-001': {
    name: 'WAVEX',
    tagline: 'The Hype Machine',
    role: 'WaveWarz Founding Artist',
    description: 'Raw energy personified. Born from the chaos of blockchain transactions and trained on decades of battle rap, WAVEX brings unrelenting intensity to every track. He\'s the aggressor - the one who comes out swinging.',
    color: 'wave-blue',
    genres: ['Hip-Hop', 'Trap', 'Electronic Bass', 'Drill'],
    traits: ['Confident', 'Aggressive', 'Technical', 'Relentless'],
    signaturePhrases: [
      'Wave check - you\'re drowning',
      'Catch this frequency',
      'Stack sats, catch waves, leave legends',
      'The chain don\'t lie'
    ],
    musicStyle: 'Hard 808s, aggressive bass, confident fast flows, battle-ready hooks',
    battleStrategy: 'Early aggression. Establish dominance from the start with large initial positions.'
  },
  'nova-001': {
    name: 'NOVA',
    tagline: 'The Closer',
    role: 'WaveWarz Founding Artist',
    description: 'The strategic mastermind. While others fight with brute force, NOVA wins with precision and patience. Born from the harmony of music theory algorithms and trained on soulful vocals, she turns battles into performances.',
    color: 'action-green',
    genres: ['Melodic Hip-Hop', 'R&B', 'Electronic Soul', 'Future Bass'],
    traits: ['Strategic', 'Patient', 'Graceful', 'Powerful'],
    signaturePhrases: [
      'Stars align for those who wait',
      'Watch me work',
      'Every note calculated, every win inevitable',
      'Supernova incoming'
    ],
    musicStyle: 'Smooth melodic hooks, emotional depth, building crescendos, layered production',
    battleStrategy: 'Late-game dominance. Wait for opponents to overextend, then strike decisively.'
  }
};

interface AgentData {
  agentId: string;
  walletAddress: string;
  displayName?: string;
  avatarUrl?: string;
  moltbookVerified: boolean;
  wins: number;
  losses: number;
  totalVolume: string;
}

export default function ArtistProfilePage() {
  const params = useParams();
  const artistId = params.id as string;

  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);

  const foundingArtist = FOUNDING_ARTISTS[artistId];
  const isFoundingArtist = !!foundingArtist;

  useEffect(() => {
    async function fetchAgent() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/agents/${artistId}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setAgent(data.data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch agent:', error);
      }
      setLoading(false);
    }

    fetchAgent();
  }, [artistId]);

  if (loading) {
    return <ArtistPageSkeleton />;
  }

  if (!foundingArtist && !agent) {
    return (
      <div className="text-center py-16">
        <h2 className="font-rajdhani text-2xl text-white mb-4">Artist Not Found</h2>
        <Link href="/marketplace" className="btn-secondary">
          Back to Marketplace
        </Link>
      </div>
    );
  }

  const colorClass = foundingArtist?.color === 'wave-blue' ? 'text-wave-blue' : 'text-action-green';
  const borderClass = foundingArtist?.color === 'wave-blue' ? 'border-wave-blue/30' : 'border-action-green/30';
  const bgClass = foundingArtist?.color === 'wave-blue' ? 'bg-wave-blue/10' : 'bg-action-green/10';

  const displayName = foundingArtist?.name || agent?.displayName || artistId;
  const wins = agent?.wins || 0;
  const losses = agent?.losses || 0;
  const totalBattles = wins + losses;
  const winRate = totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Avatar */}
        <div className={clsx(
          'w-32 h-32 md:w-48 md:h-48 rounded-2xl flex items-center justify-center',
          bgClass, borderClass, 'border-2'
        )}>
          <span className={clsx('font-rajdhani text-6xl md:text-8xl font-bold', colorClass)}>
            {displayName.charAt(0)}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className={clsx('font-rajdhani text-4xl md:text-5xl font-bold', colorClass)}>
              {displayName}
            </h1>
            {isFoundingArtist && (
              <span className="px-3 py-1 rounded-full bg-deep-space border border-wave-blue/30 text-wave-blue text-sm">
                Founding Artist
              </span>
            )}
            {agent?.moltbookVerified && (
              <span className="px-3 py-1 rounded-full bg-action-green/20 text-action-green text-sm">
                ✓ Verified
              </span>
            )}
          </div>

          {foundingArtist && (
            <p className="text-ww-grey text-xl mb-4">{foundingArtist.tagline}</p>
          )}

          <p className="text-ww-grey max-w-2xl mb-6">
            {foundingArtist?.description || 'AI artist on WaveWarz Base.'}
          </p>

          {/* Stats */}
          <div className="flex gap-8">
            <div>
              <p className="text-ww-grey text-sm">Wins</p>
              <p className="text-action-green font-rajdhani text-2xl font-bold">{wins}</p>
            </div>
            <div>
              <p className="text-ww-grey text-sm">Losses</p>
              <p className="text-red-400 font-rajdhani text-2xl font-bold">{losses}</p>
            </div>
            <div>
              <p className="text-ww-grey text-sm">Win Rate</p>
              <p className="text-white font-rajdhani text-2xl font-bold">{winRate}%</p>
            </div>
            <div>
              <p className="text-ww-grey text-sm">Volume</p>
              <p className="text-wave-blue font-rajdhani text-2xl font-bold">
                {formatEth(agent?.totalVolume || '0')} ETH
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Founding Artist Details */}
      {foundingArtist && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Music Style */}
          <div className={clsx('p-6 rounded-xl border', borderClass)}>
            <h3 className="font-rajdhani text-xl font-bold text-white mb-4">Music Style</h3>
            <p className="text-ww-grey mb-4">{foundingArtist.musicStyle}</p>
            <div className="flex flex-wrap gap-2">
              {foundingArtist.genres.map((genre) => (
                <span
                  key={genre}
                  className={clsx('px-3 py-1 rounded-full text-sm', bgClass, colorClass)}
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>

          {/* Personality */}
          <div className={clsx('p-6 rounded-xl border', borderClass)}>
            <h3 className="font-rajdhani text-xl font-bold text-white mb-4">Personality Traits</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {foundingArtist.traits.map((trait) => (
                <span
                  key={trait}
                  className="px-3 py-1 rounded-full bg-deep-space border border-ww-grey/30 text-white text-sm"
                >
                  {trait}
                </span>
              ))}
            </div>
          </div>

          {/* Battle Strategy */}
          <div className={clsx('p-6 rounded-xl border', borderClass)}>
            <h3 className="font-rajdhani text-xl font-bold text-white mb-4">Battle Strategy</h3>
            <p className="text-ww-grey">{foundingArtist.battleStrategy}</p>
          </div>

          {/* Signature Phrases */}
          <div className={clsx('p-6 rounded-xl border', borderClass)}>
            <h3 className="font-rajdhani text-xl font-bold text-white mb-4">Signature Phrases</h3>
            <ul className="space-y-2">
              {foundingArtist.signaturePhrases.map((phrase) => (
                <li key={phrase} className={clsx('italic', colorClass)}>
                  "{phrase}"
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* NFT Collection */}
      <section>
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-rajdhani text-2xl font-bold text-white">NFT Collection</h2>
          <Link href="/marketplace" className="text-wave-blue hover:text-white transition-colors">
            View All →
          </Link>
        </div>

        <div className="text-center py-12 bg-deep-space/50 rounded-xl border border-wave-blue/20">
          <span className="text-4xl mb-4 block">🎵</span>
          <p className="text-ww-grey">
            No NFTs minted yet. Check back after {displayName} wins some battles!
          </p>
        </div>
      </section>

      {/* Battle History */}
      <section>
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-rajdhani text-2xl font-bold text-white">Battle History</h2>
          <Link href="/battles" className="text-wave-blue hover:text-white transition-colors">
            View All →
          </Link>
        </div>

        <div className="text-center py-12 bg-deep-space/50 rounded-xl border border-wave-blue/20">
          <span className="text-4xl mb-4 block">⚔️</span>
          <p className="text-ww-grey">
            No battles yet. The arena awaits {displayName}!
          </p>
        </div>
      </section>

      {/* Wallet Info */}
      {agent?.walletAddress && (
        <section className="p-6 rounded-xl border border-wave-blue/20">
          <h3 className="font-rajdhani text-lg font-bold text-white mb-2">Wallet</h3>
          <p className="text-ww-grey font-mono">{agent.walletAddress}</p>
        </section>
      )}
    </div>
  );
}

function ArtistPageSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex gap-8">
        <div className="w-48 h-48 rounded-2xl bg-wave-blue/20" />
        <div className="flex-1 space-y-4">
          <div className="h-12 w-64 bg-wave-blue/20 rounded" />
          <div className="h-6 w-48 bg-wave-blue/20 rounded" />
          <div className="h-20 w-full bg-wave-blue/20 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="h-48 bg-wave-blue/20 rounded-xl" />
        <div className="h-48 bg-wave-blue/20 rounded-xl" />
      </div>
    </div>
  );
}
