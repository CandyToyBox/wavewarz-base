'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { formatEth, formatAddress } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

interface NFTData {
  tokenId: number;
  title: string;
  artistName: string;
  artistWallet: string;
  ownerWallet: string;
  genre: string;
  trackUrl: string;
  duration: number;
  battleId: number;
  mintedAt: string;
  metadataUri: string;
  listingType: 'none' | 'fixed_price' | 'auction';
  listing?: {
    seller: string;
    price: string;
    listedAt: string;
  };
  auction?: {
    seller: string;
    startingPrice: string;
    reservePrice: string;
    highestBid: string;
    highestBidder: string;
    startTime: string;
    endTime: string;
    settled: boolean;
    ended?: boolean;
  };
}

export default function NFTDetailPage() {
  const params = useParams();
  const tokenId = parseInt(params.tokenId as string, 10);

  const [nft, setNft] = useState<NFTData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    async function fetchNFT() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/nfts/${tokenId}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setNft(data.data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch NFT:', error);
      }
      setLoading(false);
    }

    fetchNFT();
  }, [tokenId]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  if (loading) {
    return <NFTPageSkeleton />;
  }

  if (!nft) {
    return (
      <div className="text-center py-16">
        <h2 className="font-rajdhani text-2xl text-white mb-4">NFT Not Found</h2>
        <Link href="/marketplace" className="btn-secondary">
          Back to Marketplace
        </Link>
      </div>
    );
  }

  const isListed = nft.listingType !== 'none';
  const isAuction = nft.listingType === 'auction';
  const auctionEnded = nft.auction?.ended || (nft.auction?.endTime && new Date(nft.auction.endTime) <= new Date());

  return (
    <div className="max-w-6xl mx-auto">
      <Link
        href="/marketplace"
        className="text-ww-grey hover:text-white text-sm mb-6 inline-block"
      >
        ← Back to Marketplace
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Artwork & Audio */}
        <div className="space-y-6">
          {/* Artwork */}
          <div className="aspect-square rounded-2xl bg-gradient-to-br from-wave-blue/20 to-action-green/20 flex items-center justify-center border border-wave-blue/30 relative overflow-hidden">
            {/* Animated background */}
            <div className="absolute inset-0 opacity-30">
              <div className="absolute inset-0 bg-gradient-to-r from-wave-blue/50 to-action-green/50 animate-pulse" />
            </div>

            <div className="relative z-10 text-center">
              <span className="text-8xl block mb-4">🎵</span>
              <p className="text-ww-grey">Music NFT</p>
            </div>

            {isAuction && !auctionEnded && (
              <div className="absolute top-4 right-4">
                <span className="bg-action-green text-deep-space font-bold px-3 py-1 rounded-full text-sm">
                  LIVE AUCTION
                </span>
              </div>
            )}
          </div>

          {/* Audio Player */}
          {nft.trackUrl && (
            <div className="p-6 rounded-xl bg-deep-space/80 border border-wave-blue/30">
              <audio ref={audioRef} src={nft.trackUrl} preload="metadata" />

              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlay}
                  className="w-14 h-14 rounded-full bg-wave-blue flex items-center justify-center hover:bg-wave-blue/80 transition-colors"
                >
                  {isPlaying ? (
                    <svg className="w-6 h-6 text-deep-space" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-deep-space ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                <div className="flex-1">
                  <p className="text-white font-semibold">{nft.title}</p>
                  <p className="text-ww-grey text-sm">
                    {Math.floor(nft.duration / 60)}:{(nft.duration % 60).toString().padStart(2, '0')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Details */}
        <div className="space-y-6">
          {/* Title & Artist */}
          <div>
            <h1 className="font-rajdhani text-4xl font-bold text-white mb-2">
              {nft.title}
            </h1>
            <Link
              href={`/artists/${nft.artistWallet}`}
              className="text-wave-blue hover:text-white transition-colors"
            >
              by {nft.artistName}
            </Link>
          </div>

          {/* Price / Auction Info */}
          {isListed && (
            <div className="p-6 rounded-xl bg-deep-space/80 border border-wave-blue/30">
              {nft.listingType === 'fixed_price' && nft.listing && (
                <>
                  <p className="text-ww-grey text-sm mb-1">Current Price</p>
                  <p className="font-rajdhani text-4xl font-bold text-white mb-4">
                    {formatEth(nft.listing.price)} ETH
                  </p>
                  <button className="btn-primary w-full">
                    Buy Now
                  </button>
                  <p className="text-ww-grey text-xs text-center mt-2">
                    Seller: {formatAddress(nft.listing.seller)}
                  </p>
                </>
              )}

              {isAuction && nft.auction && (
                <>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-ww-grey text-sm mb-1">
                        {nft.auction.highestBid !== '0' ? 'Current Bid' : 'Starting Bid'}
                      </p>
                      <p className="font-rajdhani text-4xl font-bold text-white">
                        {nft.auction.highestBid !== '0'
                          ? formatEth(nft.auction.highestBid)
                          : formatEth(nft.auction.startingPrice)} ETH
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-ww-grey text-sm mb-1">
                        {auctionEnded ? 'Auction Ended' : 'Ends'}
                      </p>
                      <p className={clsx(
                        'font-semibold',
                        auctionEnded ? 'text-ww-grey' : 'text-action-green'
                      )}>
                        {auctionEnded
                          ? 'Ended'
                          : formatDistanceToNow(new Date(nft.auction.endTime), { addSuffix: true })}
                      </p>
                    </div>
                  </div>

                  {nft.auction.highestBidder && nft.auction.highestBidder !== '0x0000000000000000000000000000000000000000' && (
                    <p className="text-ww-grey text-sm mb-4">
                      Leading: {formatAddress(nft.auction.highestBidder)}
                    </p>
                  )}

                  {!auctionEnded ? (
                    <button className="btn-primary w-full">
                      Place Bid
                    </button>
                  ) : (
                    <button className="btn-secondary w-full" disabled>
                      Auction Ended
                    </button>
                  )}

                  {nft.auction.reservePrice && nft.auction.reservePrice !== '0' && (
                    <p className="text-ww-grey text-xs text-center mt-2">
                      Reserve: {formatEth(nft.auction.reservePrice)} ETH
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {!isListed && (
            <div className="p-6 rounded-xl bg-deep-space/80 border border-ww-grey/30">
              <p className="text-ww-grey text-center">This NFT is not currently for sale</p>
            </div>
          )}

          {/* Details */}
          <div className="p-6 rounded-xl bg-deep-space/80 border border-wave-blue/30 space-y-4">
            <h3 className="font-rajdhani text-lg font-bold text-white">Details</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-ww-grey text-sm">Token ID</p>
                <p className="text-white">#{nft.tokenId}</p>
              </div>
              <div>
                <p className="text-ww-grey text-sm">Genre</p>
                <p className="text-white">{nft.genre}</p>
              </div>
              <div>
                <p className="text-ww-grey text-sm">Duration</p>
                <p className="text-white">
                  {Math.floor(nft.duration / 60)}:{(nft.duration % 60).toString().padStart(2, '0')}
                </p>
              </div>
              <div>
                <p className="text-ww-grey text-sm">Minted</p>
                <p className="text-white">
                  {formatDistanceToNow(new Date(nft.mintedAt), { addSuffix: true })}
                </p>
              </div>
            </div>

            {nft.battleId > 0 && (
              <div className="pt-4 border-t border-wave-blue/20">
                <p className="text-ww-grey text-sm mb-1">From Battle</p>
                <Link
                  href={`/battles/${nft.battleId}`}
                  className="text-wave-blue hover:text-white transition-colors"
                >
                  Battle #{nft.battleId} →
                </Link>
              </div>
            )}
          </div>

          {/* Ownership */}
          <div className="p-6 rounded-xl bg-deep-space/80 border border-wave-blue/30 space-y-4">
            <h3 className="font-rajdhani text-lg font-bold text-white">Ownership</h3>

            <div>
              <p className="text-ww-grey text-sm">Artist</p>
              <Link
                href={`/artists/${nft.artistWallet}`}
                className="text-wave-blue hover:text-white transition-colors"
              >
                {nft.artistName}
              </Link>
              <p className="text-ww-grey text-xs font-mono mt-1">
                {formatAddress(nft.artistWallet)}
              </p>
            </div>

            <div>
              <p className="text-ww-grey text-sm">Current Owner</p>
              <p className="text-white font-mono">
                {formatAddress(nft.ownerWallet)}
              </p>
            </div>

            <div className="pt-4 border-t border-wave-blue/20">
              <p className="text-ww-grey text-sm mb-1">Royalties</p>
              <p className="text-action-green font-bold">10%</p>
              <p className="text-ww-grey text-xs">
                Artist earns 10% on all secondary sales
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NFTPageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto animate-pulse">
      <div className="h-6 w-32 bg-wave-blue/20 rounded mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="aspect-square rounded-2xl bg-wave-blue/20" />
        <div className="space-y-6">
          <div className="h-12 w-3/4 bg-wave-blue/20 rounded" />
          <div className="h-6 w-1/2 bg-wave-blue/20 rounded" />
          <div className="h-48 bg-wave-blue/20 rounded-xl" />
          <div className="h-48 bg-wave-blue/20 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
