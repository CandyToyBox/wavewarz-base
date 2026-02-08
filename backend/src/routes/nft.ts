import { FastifyPluginAsync } from 'fastify';
import { NFTService } from '../services/nft.service.js';
import { z } from 'zod';

const TokenIdParamsSchema = z.object({
  tokenId: z.string().regex(/^\d+$/).transform(Number),
});

const ListNFTsQuerySchema = z.object({
  artistWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  genre: z.string().optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  pageSize: z.string().regex(/^\d+$/).transform(Number).optional(),
});

const ListingsQuerySchema = z.object({
  type: z.enum(['fixed_price', 'auction']).optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  pageSize: z.string().regex(/^\d+$/).transform(Number).optional(),
});

const VerifyArtistBodySchema = z.object({
  artistWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  verified: z.boolean(),
});

export const nftRoutes: FastifyPluginAsync<{
  nftService: NFTService;
  adminApiKey: string;
}> = async (fastify, opts) => {
  const { nftService, adminApiKey } = opts;

  // Middleware to verify admin API key
  const verifyAdmin = async (request: { headers: { 'x-api-key'?: string } }) => {
    if (request.headers['x-api-key'] !== adminApiKey) {
      throw new Error('Unauthorized');
    }
  };

  // ============ NFT Endpoints ============

  /**
   * GET /api/nfts - List all NFTs
   */
  fastify.get('/', async (request, reply) => {
    const query = ListNFTsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid query parameters',
      });
    }

    try {
      const { nfts, total } = await nftService.listNFTs({
        artistWallet: query.data.artistWallet,
        genre: query.data.genre,
        page: query.data.page,
        pageSize: query.data.pageSize,
      });

      return {
        success: true,
        data: {
          nfts,
          total,
          page: query.data.page || 1,
          pageSize: query.data.pageSize || 20,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to list NFTs',
      });
    }
  });

  /**
   * GET /api/nfts/:tokenId - Get NFT by token ID
   */
  fastify.get('/:tokenId', async (request, reply) => {
    const params = TokenIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid token ID',
      });
    }

    try {
      // Try database first, fallback to chain
      let nft = await nftService.getNFT(params.data.tokenId);
      if (!nft) {
        nft = await nftService.getNFTFromChain(params.data.tokenId);
      }

      if (!nft) {
        return reply.status(404).send({
          success: false,
          error: 'NFT not found',
        });
      }

      // Get listing info
      const listingType = await nftService.getListingType(params.data.tokenId);
      let listing = null;
      let auction = null;

      if (listingType === 'fixed_price') {
        listing = await nftService.getListing(params.data.tokenId);
      } else if (listingType === 'auction') {
        auction = await nftService.getAuction(params.data.tokenId);
      }

      return {
        success: true,
        data: {
          ...nft,
          listingType,
          listing,
          auction,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get NFT',
      });
    }
  });

  /**
   * GET /api/nfts/artist/:wallet - Get NFTs by artist wallet
   */
  fastify.get('/artist/:wallet', async (request, reply) => {
    const WalletParamsSchema = z.object({
      wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    });

    const params = WalletParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid wallet address',
      });
    }

    try {
      const tokenIds = await nftService.getArtistNFTs(params.data.wallet);

      // Get full NFT details for each
      const nfts = await Promise.all(
        tokenIds.map(async (tokenId) => {
          const nft = await nftService.getNFT(tokenId) ||
                      await nftService.getNFTFromChain(tokenId);
          return nft;
        })
      );

      return {
        success: true,
        data: nfts.filter(Boolean),
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get artist NFTs',
      });
    }
  });

  /**
   * GET /api/nfts/supply - Get total NFT supply
   */
  fastify.get('/supply', async (request, reply) => {
    try {
      const supply = await nftService.getTotalSupply();
      return { success: true, data: { totalSupply: supply } };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get supply',
      });
    }
  });

  // ============ Marketplace Endpoints ============

  /**
   * GET /api/nfts/marketplace/listings - Get active listings
   */
  fastify.get('/marketplace/listings', async (request, reply) => {
    const query = ListingsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid query parameters',
      });
    }

    try {
      const { listings, total } = await nftService.getActiveListings({
        type: query.data.type,
        page: query.data.page,
        pageSize: query.data.pageSize,
      });

      return {
        success: true,
        data: {
          listings,
          total,
          page: query.data.page || 1,
          pageSize: query.data.pageSize || 20,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get listings',
      });
    }
  });

  /**
   * GET /api/nfts/marketplace/auctions - Get active auctions
   */
  fastify.get('/marketplace/auctions', async (request, reply) => {
    try {
      const { listings, total } = await nftService.getActiveListings({
        type: 'auction',
      });

      return {
        success: true,
        data: {
          auctions: listings,
          total,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get auctions',
      });
    }
  });

  /**
   * GET /api/nfts/:tokenId/listing - Get listing info for a specific NFT
   */
  fastify.get('/:tokenId/listing', async (request, reply) => {
    const params = TokenIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid token ID',
      });
    }

    try {
      const listingType = await nftService.getListingType(params.data.tokenId);

      if (listingType === 'none') {
        return {
          success: true,
          data: { listingType: 'none', listing: null, auction: null },
        };
      }

      if (listingType === 'fixed_price') {
        const listing = await nftService.getListing(params.data.tokenId);
        return {
          success: true,
          data: { listingType, listing, auction: null },
        };
      }

      if (listingType === 'auction') {
        const auction = await nftService.getAuction(params.data.tokenId);
        const ended = await nftService.isAuctionEnded(params.data.tokenId);
        return {
          success: true,
          data: { listingType, listing: null, auction: { ...auction, ended } },
        };
      }

      return {
        success: true,
        data: { listingType: 'none', listing: null, auction: null },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get listing',
      });
    }
  });

  // ============ Admin Endpoints ============

  /**
   * POST /api/nfts/artists/verify - Verify an artist (admin only)
   */
  fastify.post('/artists/verify', async (request, reply) => {
    try {
      await verifyAdmin(request);
    } catch {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const body = VerifyArtistBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
      });
    }

    try {
      const txHash = await nftService.verifyArtist(
        body.data.artistWallet,
        body.data.verified
      );

      return {
        success: true,
        data: { txHash, verified: body.data.verified },
      };
    } catch (error) {
      fastify.log.error(error);
      const message = error instanceof Error ? error.message : 'Failed to verify artist';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * GET /api/nfts/artists/:wallet/verified - Check if artist is verified
   */
  fastify.get('/artists/:wallet/verified', async (request, reply) => {
    const WalletParamsSchema = z.object({
      wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    });

    const params = WalletParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid wallet address',
      });
    }

    try {
      const verified = await nftService.isArtistVerified(params.data.wallet);
      return { success: true, data: { verified } };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to check verification',
      });
    }
  });
};
