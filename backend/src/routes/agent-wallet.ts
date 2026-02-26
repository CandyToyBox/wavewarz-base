/**
 * Agent Wallet Routes
 * API endpoints for managing AI agent wallets (WAVEX & NOVA)
 * Uses Coinbase CDP SDK for wallet operations
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { cdpService } from '../services/cdp.service.js';

// Request body types
interface BuySharesBody {
  battleId: string;
  artistA: boolean;
  amount: string;
  minTokensOut: string;
}

interface SellSharesBody {
  battleId: string;
  artistA: boolean;
  tokenAmount: string;
  minEthOut: string;
}

interface ClaimSharesBody {
  battleId: string;
}

interface MintNFTBody {
  title: string;
  genre: string;
  trackUrl: string;
  duration: number;
  metadataUri: string;
}

interface ListNFTBody {
  tokenId: string;
  price: string;
}

interface CreateAuctionBody {
  tokenId: string;
  startingPrice: string;
  reservePrice: string;
  duration: number;
}

export async function agentWalletRoutes(fastify: FastifyInstance) {
  // Debug CDP status
  fastify.get('/debug', async (_request: FastifyRequest, reply: FastifyReply) => {
    const addresses = cdpService.getAllAgentAddresses();
    const agentIds = ['wavex-001', 'nova-001', 'lil-lob-001'];
    return {
      success: true,
      data: {
        cdpInitialized: Object.keys(addresses).length > 0,
        walletCount: Object.keys(addresses).length,
        agents: agentIds.map(id => ({
          id,
          ready: cdpService.isAgentReady(id),
          address: cdpService.getAddress(id),
          managed: cdpService.isAgentManaged(id),
        })),
        envVarsSet: {
          CDP_API_KEY_ID: !!process.env.CDP_API_KEY_ID,
          CDP_API_KEY_SECRET: !!process.env.CDP_API_KEY_SECRET,
          CDP_WALLET_SECRET: !!process.env.CDP_WALLET_SECRET,
          COINBASE_API_KEY_ID: !!process.env.COINBASE_API_KEY_ID,
          COINBASE_API_SECRET: !!process.env.COINBASE_API_SECRET,
          COINBASE_WALLET_SECRET: !!process.env.COINBASE_WALLET_SECRET,
        },
      },
    };
  });

  // Get all agent wallet addresses
  fastify.get('/wallets', async (_request: FastifyRequest, reply: FastifyReply) => {
    const addresses = cdpService.getAllAgentAddresses();
    return {
      success: true,
      data: addresses,
    };
  });

  // Get specific agent wallet info
  fastify.get(
    '/wallets/:agentId',
    async (
      request: FastifyRequest<{ Params: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      const { agentId } = request.params;

      if (!cdpService.isAgentReady(agentId)) {
        return reply.status(404).send({
          success: false,
          error: 'Agent not found',
        });
      }

      const address = cdpService.getAddress(agentId);
      const balance = await cdpService.getBalance(agentId);

      return {
        success: true,
        data: {
          agentId,
          address,
          balance,
          currency: 'ETH',
        },
      };
    }
  );

  // Get agent balance
  fastify.get(
    '/wallets/:agentId/balance',
    async (
      request: FastifyRequest<{ Params: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      const { agentId } = request.params;

      try {
        const balance = await cdpService.getBalance(agentId);
        return {
          success: true,
          data: {
            balance,
            currency: 'ETH',
          },
        };
      } catch (error) {
        return reply.status(404).send({
          success: false,
          error: 'Agent not found',
        });
      }
    }
  );

  // Buy battle shares (agent action)
  fastify.post(
    '/wallets/:agentId/buy-shares',
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Body: BuySharesBody;
      }>,
      reply: FastifyReply
    ) => {
      const { agentId } = request.params;
      const { battleId, artistA, amount, minTokensOut } = request.body;

      const battleContract = process.env.WAVEWARZ_CONTRACT_ADDRESS;
      if (!battleContract) {
        return reply.status(500).send({
          success: false,
          error: 'Battle contract not configured',
        });
      }

      try {
        const result = await cdpService.buyBattleShares(
          agentId,
          battleContract,
          BigInt(battleId),
          artistA,
          amount,
          minTokensOut
        );

        return {
          success: true,
          data: {
            txHash: result.txHash,
            status: 'pending',
          },
        };
      } catch (error) {
        return reply.status(400).send({
          success: false,
          error: error instanceof Error ? error.message : 'Transaction failed',
        });
      }
    }
  );

  // Sell battle shares (agent action)
  fastify.post(
    '/wallets/:agentId/sell-shares',
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Body: SellSharesBody;
      }>,
      reply: FastifyReply
    ) => {
      const { agentId } = request.params;
      const { battleId, artistA, tokenAmount, minEthOut } = request.body;

      const battleContract = process.env.WAVEWARZ_CONTRACT_ADDRESS;
      if (!battleContract) {
        return reply.status(500).send({
          success: false,
          error: 'Battle contract not configured',
        });
      }

      try {
        const result = await cdpService.sellBattleShares(
          agentId,
          battleContract,
          BigInt(battleId),
          artistA,
          tokenAmount,
          minEthOut
        );

        return {
          success: true,
          data: {
            txHash: result.txHash,
            status: 'pending',
          },
        };
      } catch (error) {
        return reply.status(400).send({
          success: false,
          error: error instanceof Error ? error.message : 'Transaction failed',
        });
      }
    }
  );

  // Claim battle shares (trader withdraws proportional ETH after settlement)
  fastify.post(
    '/wallets/:agentId/claim-shares',
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Body: ClaimSharesBody;
      }>,
      reply: FastifyReply
    ) => {
      const { agentId } = request.params;
      const { battleId } = request.body;

      const battleContract = process.env.WAVEWARZ_CONTRACT_ADDRESS;
      if (!battleContract) {
        return reply.status(500).send({
          success: false,
          error: 'Battle contract not configured',
        });
      }

      try {
        const result = await cdpService.claimBattleShares(
          agentId,
          battleContract,
          BigInt(battleId)
        );

        return {
          success: true,
          data: {
            txHash: result.txHash,
            status: 'pending',
          },
        };
      } catch (error) {
        return reply.status(400).send({
          success: false,
          error: error instanceof Error ? error.message : 'Claim failed',
        });
      }
    }
  );

  // Mint NFT (agent action)
  fastify.post(
    '/wallets/:agentId/mint-nft',
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Body: MintNFTBody;
      }>,
      reply: FastifyReply
    ) => {
      const { agentId } = request.params;
      const { title, genre, trackUrl, duration, metadataUri } = request.body;

      const nftContract = process.env.MUSIC_NFT_CONTRACT;
      if (!nftContract) {
        return reply.status(500).send({
          success: false,
          error: 'NFT contract not configured',
        });
      }

      try {
        const result = await cdpService.mintNFT(
          agentId,
          nftContract,
          title,
          genre,
          trackUrl,
          duration,
          metadataUri
        );

        return {
          success: true,
          data: {
            txHash: result.txHash,
            status: 'pending',
          },
        };
      } catch (error) {
        return reply.status(400).send({
          success: false,
          error: error instanceof Error ? error.message : 'Transaction failed',
        });
      }
    }
  );

  // List NFT for sale (agent action)
  fastify.post(
    '/wallets/:agentId/list-nft',
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Body: ListNFTBody;
      }>,
      reply: FastifyReply
    ) => {
      const { agentId } = request.params;
      const { tokenId, price } = request.body;

      const marketplaceContract = process.env.MARKETPLACE_CONTRACT;
      if (!marketplaceContract) {
        return reply.status(500).send({
          success: false,
          error: 'Marketplace contract not configured',
        });
      }

      try {
        const result = await cdpService.listNFTForSale(
          agentId,
          marketplaceContract,
          tokenId,
          price
        );

        return {
          success: true,
          data: {
            txHash: result.txHash,
            status: 'pending',
          },
        };
      } catch (error) {
        return reply.status(400).send({
          success: false,
          error: error instanceof Error ? error.message : 'Transaction failed',
        });
      }
    }
  );

  // Create auction (agent action)
  fastify.post(
    '/wallets/:agentId/create-auction',
    async (
      request: FastifyRequest<{
        Params: { agentId: string };
        Body: CreateAuctionBody;
      }>,
      reply: FastifyReply
    ) => {
      const { agentId } = request.params;
      const { tokenId, startingPrice, reservePrice, duration } = request.body;

      const marketplaceContract = process.env.MARKETPLACE_CONTRACT;
      if (!marketplaceContract) {
        return reply.status(500).send({
          success: false,
          error: 'Marketplace contract not configured',
        });
      }

      try {
        const result = await cdpService.createAuction(
          agentId,
          marketplaceContract,
          tokenId,
          startingPrice,
          reservePrice,
          duration
        );

        return {
          success: true,
          data: {
            txHash: result.txHash,
            status: 'pending',
          },
        };
      } catch (error) {
        return reply.status(400).send({
          success: false,
          error: error instanceof Error ? error.message : 'Transaction failed',
        });
      }
    }
  );
}

export default agentWalletRoutes;
