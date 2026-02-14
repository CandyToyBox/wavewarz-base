import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ethers, Contract, Wallet, JsonRpcProvider } from 'ethers';

// Contract ABIs (minimal)
const NFT_ABI = [
  'function mintMusicNFT(string title, string artistName, string genre, string trackUrl, uint256 duration, uint256 battleId, string metadataURI) payable returns (uint256)',
  'function getArtistTokens(address artist) view returns (uint256[])',
  'function getTokenMetadata(uint256 tokenId) view returns (tuple(string title, string artistName, string genre, string trackUrl, uint256 duration, uint256 battleId, uint256 mintedAt))',
  'function totalSupply() view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function verifiedArtists(address) view returns (bool)',
  'function setArtistVerified(address artist, bool verified)',
  'event MusicNFTMinted(uint256 indexed tokenId, address indexed artist, string title, string trackUrl)',
];

const MARKETPLACE_ABI = [
  'function listItem(uint256 tokenId, uint256 price)',
  'function delistItem(uint256 tokenId)',
  'function buyItem(uint256 tokenId) payable',
  'function createAuction(uint256 tokenId, uint256 startingPrice, uint256 reservePrice, uint256 duration)',
  'function placeBid(uint256 tokenId) payable',
  'function settleAuction(uint256 tokenId)',
  'function cancelAuction(uint256 tokenId)',
  'function getListing(uint256 tokenId) view returns (tuple(address seller, uint256 price, uint256 listedAt))',
  'function getAuction(uint256 tokenId) view returns (tuple(address seller, uint256 startingPrice, uint256 reservePrice, uint256 highestBid, address highestBidder, uint256 startTime, uint256 endTime, bool settled))',
  'function listingType(uint256 tokenId) view returns (uint8)',
  'function isAuctionEnded(uint256 tokenId) view returns (bool)',
  'event ItemListed(uint256 indexed tokenId, address indexed seller, uint256 price)',
  'event ItemSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price)',
  'event AuctionCreated(uint256 indexed tokenId, address indexed seller, uint256 startingPrice, uint256 reservePrice, uint256 endTime)',
  'event BidPlaced(uint256 indexed tokenId, address indexed bidder, uint256 amount)',
  'event AuctionSettled(uint256 indexed tokenId, address indexed winner, uint256 amount)',
];

export interface NFTMetadata {
  tokenId: number;
  title: string;
  artistName: string;
  artistWallet: string;
  genre: string;
  trackUrl: string;
  duration: number;
  battleId: number;
  mintedAt: Date;
  metadataUri: string;
  ownerWallet: string;
}

export interface Listing {
  tokenId: number;
  seller: string;
  price: string;
  listedAt: Date;
}

export interface Auction {
  tokenId: number;
  seller: string;
  startingPrice: string;
  reservePrice: string;
  highestBid: string;
  highestBidder: string;
  startTime: Date;
  endTime: Date;
  settled: boolean;
}

export type ListingType = 'none' | 'fixed_price' | 'auction';

export class NFTService {
  private supabase: SupabaseClient;
  private provider: JsonRpcProvider;
  private nftContract: Contract;
  private marketplaceContract: Contract;
  private adminWallet: Wallet | null = null;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    rpcUrl: string,
    nftContractAddress: string,
    marketplaceAddress: string,
    adminPrivateKey?: string
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.provider = new JsonRpcProvider(rpcUrl);

    this.nftContract = new Contract(nftContractAddress, NFT_ABI, this.provider);
    this.marketplaceContract = new Contract(marketplaceAddress, MARKETPLACE_ABI, this.provider);

    if (adminPrivateKey) {
      this.adminWallet = new Wallet(adminPrivateKey, this.provider);
      this.nftContract = this.nftContract.connect(this.adminWallet) as Contract;
      this.marketplaceContract = this.marketplaceContract.connect(this.adminWallet) as Contract;
    }
  }

  // ============ NFT Management ============

  /**
   * Verify an artist (admin only)
   */
  async verifyArtist(artistWallet: string, verified: boolean): Promise<string> {
    if (!this.adminWallet) {
      throw new Error('Admin wallet not configured');
    }

    const tx = await this.nftContract.setArtistVerified(artistWallet, verified);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Check if artist is verified
   */
  async isArtistVerified(artistWallet: string): Promise<boolean> {
    return this.nftContract.verifiedArtists(artistWallet);
  }

  /**
   * Get NFT metadata from chain
   */
  async getNFTFromChain(tokenId: number): Promise<NFTMetadata | null> {
    try {
      const [metadata, owner, uri] = await Promise.all([
        this.nftContract.getTokenMetadata(tokenId),
        this.nftContract.ownerOf(tokenId),
        this.nftContract.tokenURI(tokenId),
      ]);

      return {
        tokenId,
        title: metadata.title,
        artistName: metadata.artistName,
        artistWallet: owner, // Note: This is current owner, not original artist
        genre: metadata.genre,
        trackUrl: metadata.trackUrl,
        duration: Number(metadata.duration),
        battleId: Number(metadata.battleId),
        mintedAt: new Date(Number(metadata.mintedAt) * 1000),
        metadataUri: uri,
        ownerWallet: owner,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get all NFTs by artist
   */
  async getArtistNFTs(artistWallet: string): Promise<number[]> {
    const tokenIds = await this.nftContract.getArtistTokens(artistWallet);
    return tokenIds.map((id: bigint) => Number(id));
  }

  /**
   * Get total NFT supply
   */
  async getTotalSupply(): Promise<number> {
    const supply = await this.nftContract.totalSupply();
    return Number(supply);
  }

  // ============ Marketplace ============

  /**
   * Get listing type for a token
   */
  async getListingType(tokenId: number): Promise<ListingType> {
    const type = await this.marketplaceContract.listingType(tokenId);
    const types: ListingType[] = ['none', 'fixed_price', 'auction'];
    return types[Number(type)] || 'none';
  }

  /**
   * Get fixed price listing
   */
  async getListing(tokenId: number): Promise<Listing | null> {
    const listing = await this.marketplaceContract.getListing(tokenId);
    if (listing.seller === ethers.ZeroAddress) {
      return null;
    }

    return {
      tokenId,
      seller: listing.seller,
      price: listing.price.toString(),
      listedAt: new Date(Number(listing.listedAt) * 1000),
    };
  }

  /**
   * Get auction
   */
  async getAuction(tokenId: number): Promise<Auction | null> {
    const auction = await this.marketplaceContract.getAuction(tokenId);
    if (auction.seller === ethers.ZeroAddress) {
      return null;
    }

    return {
      tokenId,
      seller: auction.seller,
      startingPrice: auction.startingPrice.toString(),
      reservePrice: auction.reservePrice.toString(),
      highestBid: auction.highestBid.toString(),
      highestBidder: auction.highestBidder,
      startTime: new Date(Number(auction.startTime) * 1000),
      endTime: new Date(Number(auction.endTime) * 1000),
      settled: auction.settled,
    };
  }

  /**
   * Check if auction has ended
   */
  async isAuctionEnded(tokenId: number): Promise<boolean> {
    return this.marketplaceContract.isAuctionEnded(tokenId);
  }

  // ============ Database Operations ============

  /**
   * Store NFT in database
   */
  async storeNFT(nft: Omit<NFTMetadata, 'ownerWallet'> & { artistWallet: string }): Promise<void> {
    await this.supabase.from('nfts').insert({
      token_id: nft.tokenId,
      title: nft.title,
      artist_name: nft.artistName,
      artist_wallet: nft.artistWallet,
      genre: nft.genre,
      track_url: nft.trackUrl,
      duration: nft.duration,
      battle_id: nft.battleId || null,
      minted_at: nft.mintedAt.toISOString(),
      metadata_uri: nft.metadataUri,
    });
  }

  /**
   * Get NFT from database
   */
  async getNFT(tokenId: number): Promise<NFTMetadata | null> {
    const { data, error } = await this.supabase
      .from('nfts')
      .select('*')
      .eq('token_id', tokenId)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapDbToNFT(data);
  }

  /**
   * List NFTs with filters
   */
  async listNFTs(params: {
    artistWallet?: string;
    genre?: string;
    listingType?: ListingType;
    page?: number;
    pageSize?: number;
  }): Promise<{ nfts: NFTMetadata[]; total: number }> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let query = this.supabase
      .from('nfts')
      .select('*', { count: 'exact' });

    if (params.artistWallet) {
      query = query.eq('artist_wallet', params.artistWallet);
    }
    if (params.genre) {
      query = query.eq('genre', params.genre);
    }

    const { data, error, count } = await query
      .order('minted_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to list NFTs: ${error.message}`);
    }

    return {
      nfts: (data || []).map(this.mapDbToNFT),
      total: count || 0,
    };
  }

  /**
   * Get active listings
   */
  async getActiveListings(params: {
    type?: 'fixed_price' | 'auction';
    page?: number;
    pageSize?: number;
  }): Promise<{ listings: Array<NFTMetadata & { listing?: Listing; auction?: Auction }>; total: number }> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let query = this.supabase
      .from('marketplace_listings')
      .select('*, nfts(*)', { count: 'exact' });

    if (params.type) {
      query = query.eq('listing_type', params.type);
    }

    query = query.eq('is_active', true);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to get listings: ${error.message}`);
    }

    return {
      listings: (data || []).map((row: Record<string, unknown>) => ({
        ...this.mapDbToNFT(row.nfts as Record<string, unknown>),
        listing: row.listing_type === 'fixed_price' ? {
          tokenId: row.token_id as number,
          seller: row.seller as string,
          price: row.price as string,
          listedAt: new Date(row.created_at as string),
        } : undefined,
        auction: row.listing_type === 'auction' ? {
          tokenId: row.token_id as number,
          seller: row.seller as string,
          startingPrice: row.starting_price as string,
          reservePrice: row.reserve_price as string,
          highestBid: row.highest_bid as string,
          highestBidder: row.highest_bidder as string,
          startTime: new Date(row.start_time as string),
          endTime: new Date(row.end_time as string),
          settled: row.settled as boolean,
        } : undefined,
      })),
      total: count || 0,
    };
  }

  /**
   * Store marketplace listing in database
   */
  async storeListingInDb(listing: {
    tokenId: number;
    seller: string;
    listingType: 'fixed_price' | 'auction';
    price?: string;
    startingPrice?: string;
    reservePrice?: string;
    endTime?: Date;
  }): Promise<void> {
    await this.supabase.from('marketplace_listings').insert({
      token_id: listing.tokenId,
      seller: listing.seller,
      listing_type: listing.listingType,
      price: listing.price,
      starting_price: listing.startingPrice,
      reserve_price: listing.reservePrice,
      end_time: listing.endTime?.toISOString(),
      is_active: true,
    });
  }

  /**
   * Update listing status
   */
  async updateListingStatus(tokenId: number, isActive: boolean): Promise<void> {
    await this.supabase
      .from('marketplace_listings')
      .update({ is_active: isActive })
      .eq('token_id', tokenId);
  }

  // ============ Private Helpers ============

  private mapDbToNFT(row: Record<string, unknown>): NFTMetadata {
    return {
      tokenId: row.token_id as number,
      title: row.title as string,
      artistName: row.artist_name as string,
      artistWallet: row.artist_wallet as string,
      genre: row.genre as string,
      trackUrl: row.track_url as string,
      duration: row.duration as number,
      battleId: row.battle_id as number,
      mintedAt: new Date(row.minted_at as string),
      metadataUri: row.metadata_uri as string,
      ownerWallet: row.owner_wallet as string || row.artist_wallet as string,
    };
  }
}
