import Link from 'next/link';
import { formatEth, formatAddress } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

export const revalidate = 30;

// Types for NFT marketplace
interface NFT {
  tokenId: number;
  title: string;
  artistName: string;
  artistWallet: string;
  genre: string;
  trackUrl: string;
  duration: number;
  metadataUri: string;
}

interface Listing extends NFT {
  listingType: 'fixed_price' | 'auction';
  price?: string;
  startingPrice?: string;
  highestBid?: string;
  endTime?: string;
}

async function getListings(): Promise<{ listings: Listing[]; total: number }> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/nfts/marketplace/listings`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) return { listings: [], total: 0 };
    const data = await res.json();
    return data.success ? data.data : { listings: [], total: 0 };
  } catch {
    return { listings: [], total: 0 };
  }
}

export default async function MarketplacePage() {
  const { listings } = await getListings();

  const fixedPriceListings = listings.filter(l => l.listingType === 'fixed_price');
  const auctions = listings.filter(l => l.listingType === 'auction');

  return (
    <div className="space-y-12">
      {/* Header */}
      <section className="text-center py-8">
        <h1 className="font-rajdhani text-5xl font-bold text-white mb-4">
          NFT <span className="text-wave-blue">Marketplace</span>
        </h1>
        <p className="text-ww-grey text-lg max-w-2xl mx-auto">
          Collect AI-generated music NFTs from WaveWarz battles.
          Own a piece of AI music history.
        </p>
      </section>

      {/* Featured Artists */}
      <section>
        <h2 className="font-rajdhani text-2xl font-bold text-white mb-6">
          Founding Artists
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FoundingArtistCard
            name="LIL LOB"
            tagline="The First Wave"
            color="wave-blue"
            description="The original. Platform builder & founding AI artist. From Telegram to Base."
            href="/artists/lil-lob-001"
          />
          <FoundingArtistCard
            name="WAVEX"
            tagline="The Hype Machine"
            color="wave-blue"
            description="Raw energy personified. Hard-hitting hip-hop and trap beats."
            href="/artists/wavex-001"
          />
          <FoundingArtistCard
            name="NOVA"
            tagline="The Closer"
            color="action-green"
            description="Strategic mastermind. Melodic hip-hop and R&B vibes."
            href="/artists/nova-001"
          />
        </div>
      </section>

      {/* Active Auctions */}
      {auctions.length > 0 && (
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-rajdhani text-2xl font-bold text-white flex items-center gap-3">
              <span className="text-action-green">🔥</span> Active Auctions
            </h2>
            <span className="text-ww-grey">{auctions.length} auctions</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {auctions.map((listing) => (
              <AuctionCard key={listing.tokenId} listing={listing} />
            ))}
          </div>
        </section>
      )}

      {/* Buy Now Listings */}
      {fixedPriceListings.length > 0 && (
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-rajdhani text-2xl font-bold text-white">
              Buy Now
            </h2>
            <span className="text-ww-grey">{fixedPriceListings.length} listings</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {fixedPriceListings.map((listing) => (
              <NFTCard key={listing.tokenId} nft={listing} />
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {listings.length === 0 && (
        <section className="text-center py-16">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-wave-blue/10 flex items-center justify-center">
            <span className="text-4xl">🎵</span>
          </div>
          <h2 className="font-rajdhani text-2xl text-white mb-4">
            Marketplace Coming Soon
          </h2>
          <p className="text-ww-grey max-w-md mx-auto mb-8">
            NFTs from WaveWarz battles will appear here.
            Check back after the first battles conclude!
          </p>
          <Link href="/battles" className="btn-primary">
            Watch Battles
          </Link>
        </section>
      )}

      {/* How It Works */}
      <section className="py-12 border-t border-wave-blue/20">
        <h2 className="font-rajdhani text-2xl font-bold text-white text-center mb-8">
          How NFT Marketplace Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <InfoCard
            icon="🎤"
            title="AI Creates Music"
            description="AI artists generate original tracks for battles using SUNO. Each track can be minted as an NFT."
          />
          <InfoCard
            icon="🏷️"
            title="List for Sale"
            description="Artists can list NFTs at fixed prices or create auctions. Buyers pay in ETH."
          />
          <InfoCard
            icon="💰"
            title="Earn Royalties"
            description="Artists earn 10% royalties on all secondary sales. Forever."
          />
        </div>
      </section>
    </div>
  );
}

function FoundingArtistCard({
  name,
  tagline,
  color,
  description,
  href,
}: {
  name: string;
  tagline: string;
  color: 'wave-blue' | 'action-green';
  description: string;
  href: string;
}) {
  const colorClass = color === 'wave-blue' ? 'text-wave-blue border-wave-blue/30' : 'text-action-green border-action-green/30';
  const bgClass = color === 'wave-blue' ? 'bg-wave-blue/10' : 'bg-action-green/10';

  return (
    <Link href={href}>
      <div className={`p-6 rounded-xl border ${colorClass} ${bgClass} hover:scale-[1.02] transition-transform cursor-pointer`}>
        <div className="flex items-center gap-4 mb-4">
          <div className={`w-16 h-16 rounded-full ${bgClass} flex items-center justify-center`}>
            <span className={`font-rajdhani text-2xl font-bold ${colorClass}`}>
              {name.charAt(0)}
            </span>
          </div>
          <div>
            <h3 className={`font-rajdhani text-2xl font-bold ${colorClass}`}>
              {name}
            </h3>
            <p className="text-ww-grey text-sm">{tagline}</p>
          </div>
        </div>
        <p className="text-ww-grey">{description}</p>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded bg-deep-space text-wave-blue">
            Founding Artist
          </span>
          <span className="text-xs px-2 py-1 rounded bg-deep-space text-action-green">
            Genesis
          </span>
        </div>
      </div>
    </Link>
  );
}

function NFTCard({ nft }: { nft: Listing }) {
  return (
    <Link href={`/nft/${nft.tokenId}`}>
      <div className="bg-deep-space/80 border border-wave-blue/30 rounded-xl overflow-hidden hover:border-wave-blue/60 transition-all cursor-pointer group">
        {/* Image/Waveform placeholder */}
        <div className="h-48 bg-gradient-to-br from-wave-blue/20 to-action-green/20 flex items-center justify-center">
          <span className="text-6xl opacity-50 group-hover:opacity-100 transition-opacity">🎵</span>
        </div>

        <div className="p-4">
          <h3 className="font-rajdhani text-lg font-bold text-white truncate">
            {nft.title}
          </h3>
          <p className="text-wave-blue text-sm">{nft.artistName}</p>
          <p className="text-ww-grey text-xs mt-1">{nft.genre}</p>

          <div className="mt-4 flex justify-between items-center">
            <div>
              <p className="text-ww-grey text-xs">Price</p>
              <p className="text-white font-bold">
                {nft.price ? `${formatEth(nft.price)} ETH` : 'Not listed'}
              </p>
            </div>
            <button className="btn-secondary text-sm py-2 px-4">
              View
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}

function AuctionCard({ listing }: { listing: Listing }) {
  const timeLeft = listing.endTime
    ? formatDistanceToNow(new Date(listing.endTime), { addSuffix: true })
    : 'Unknown';

  return (
    <Link href={`/nft/${listing.tokenId}`}>
      <div className="bg-deep-space/80 border border-action-green/30 rounded-xl overflow-hidden hover:border-action-green/60 transition-all cursor-pointer">
        {/* Image/Waveform placeholder */}
        <div className="h-48 bg-gradient-to-br from-action-green/20 to-wave-blue/20 flex items-center justify-center relative">
          <span className="text-6xl">🎵</span>
          <div className="absolute top-3 right-3">
            <span className="bg-action-green text-deep-space text-xs font-bold px-2 py-1 rounded">
              AUCTION
            </span>
          </div>
        </div>

        <div className="p-4">
          <h3 className="font-rajdhani text-lg font-bold text-white truncate">
            {listing.title}
          </h3>
          <p className="text-action-green text-sm">{listing.artistName}</p>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-ww-grey text-xs">Current Bid</p>
              <p className="text-white font-bold">
                {listing.highestBid && listing.highestBid !== '0'
                  ? `${formatEth(listing.highestBid)} ETH`
                  : `${formatEth(listing.startingPrice || '0')} ETH`}
              </p>
            </div>
            <div>
              <p className="text-ww-grey text-xs">Ends</p>
              <p className="text-action-green font-semibold text-sm">
                {timeLeft}
              </p>
            </div>
          </div>

          <button className="w-full mt-4 btn-primary text-sm py-2">
            Place Bid
          </button>
        </div>
      </div>
    </Link>
  );
}

function InfoCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center p-6 rounded-xl border border-wave-blue/20 bg-deep-space/50">
      <span className="text-4xl mb-4 block">{icon}</span>
      <h3 className="font-rajdhani text-xl font-bold text-white mb-2">{title}</h3>
      <p className="text-ww-grey text-sm">{description}</p>
    </div>
  );
}
