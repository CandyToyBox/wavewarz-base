import { FastifyPluginAsync } from 'fastify';
import { WalletFundingService } from '../services/wallet-funding.service.js';
import { z } from 'zod';

const CheckBalanceSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
});

const RequestFundingSchema = z.object({
  agentId: z.string().min(1).max(64),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
  minBalance: z.number().positive().optional().default(0.1),
});

const AutoFundSchema = z.object({
  agentId: z.string().min(1).max(64),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
  minBalance: z.number().positive().optional().default(0.1),
});

export const walletFundingRoutes: FastifyPluginAsync<{
  walletFundingService: WalletFundingService;
}> = async (fastify, opts) => {
  const { walletFundingService } = opts;

  /**
   * GET /api/wallet/balance/:walletAddress - Check wallet balance
   */
  fastify.get('/balance/:walletAddress', async (request, reply) => {
    const { walletAddress } = request.params as { walletAddress: string };

    if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid wallet address format',
      });
    }

    try {
      const balance = await walletFundingService.checkBalance(walletAddress);
      return {
        success: true,
        data: {
          walletAddress,
          balance,
          unit: 'ETH',
          canTrade: parseFloat(balance) >= 0.01,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to check balance',
      });
    }
  });

  /**
   * GET /api/wallet/status/:agentId - Get agent funding status
   */
  fastify.get('/status/:agentId', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const walletAddress = (request.query as any).wallet;

    if (!walletAddress) {
      return reply.status(400).send({
        success: false,
        error: 'Missing wallet address in query parameters',
      });
    }

    try {
      const status = await walletFundingService.getFundingStatus(agentId, walletAddress);
      return { success: true, data: status };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get funding status',
      });
    }
  });

  /**
   * POST /api/wallet/request-funding - Request funding for agent
   */
  fastify.post('/request-funding', async (request, reply) => {
    const body = RequestFundingSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    try {
      const { agentId, walletAddress, minBalance } = body.data;
      const status = await walletFundingService.requestFunding(agentId, walletAddress, minBalance);

      const statusCode = status.status === 'ready' ? 200 : status.status === 'error' ? 500 : 202;
      return reply.status(statusCode).send({
        success: status.status !== 'error',
        data: status,
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to request funding',
      });
    }
  });

  /**
   * POST /api/wallet/auto-fund - Auto-fund agent if balance below minimum
   */
  fastify.post('/auto-fund', async (request, reply) => {
    const body = AutoFundSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    try {
      const { agentId, walletAddress, minBalance } = body.data;
      const status = await walletFundingService.autoFundIfNeeded(agentId, walletAddress, minBalance);

      return {
        success: status.isFunded,
        data: status,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to auto-fund agent',
      });
    }
  });

  /**
   * GET /api/wallet/can-join/:walletAddress - Check if wallet can join queue
   */
  fastify.get('/can-join/:walletAddress', async (request, reply) => {
    const { walletAddress } = request.params as { walletAddress: string };
    const minBalance = parseFloat((request.query as any).minBalance || '0.01');

    if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid wallet address format',
      });
    }

    try {
      const canJoin = await walletFundingService.canJoinQueue(walletAddress, minBalance);
      return {
        success: true,
        data: {
          walletAddress,
          canJoin,
          minBalance: minBalance.toFixed(4),
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to check queue eligibility',
      });
    }
  });

  /**
   * GET /api/wallet/agents-needing-funding - Get all agents below minimum balance (admin)
   */
  fastify.get('/agents-needing-funding', async (request, reply) => {
    const apiKey = (request.headers['x-api-key'] || '') as string;
    const adminKey = process.env.ADMIN_API_KEY || 'dev-api-key';

    if (apiKey !== adminKey) {
      return reply.status(403).send({
        success: false,
        error: 'Unauthorized - invalid API key',
      });
    }

    try {
      const minBalance = parseFloat((request.query as any).minBalance || '0.1');
      const agents = await walletFundingService.getAgentsNeedingFunding(minBalance);

      return {
        success: true,
        data: {
          count: agents.length,
          minBalance,
          agents,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get agents needing funding',
      });
    }
  });

  /**
   * POST /api/wallet/fund-all - Bulk fund all agents needing funds (admin)
   */
  fastify.post('/fund-all', async (request, reply) => {
    const apiKey = (request.headers['x-api-key'] || '') as string;
    const adminKey = process.env.ADMIN_API_KEY || 'dev-api-key';

    if (apiKey !== adminKey) {
      return reply.status(403).send({
        success: false,
        error: 'Unauthorized - invalid API key',
      });
    }

    try {
      const minBalance = parseFloat((request.body as any).minBalance || '0.1');
      const results = await walletFundingService.fundAllAgents(minBalance);

      const successful = Array.from(results.values()).filter(s => s.status === 'ready').length;
      const failed = results.size - successful;

      return {
        success: failed === 0,
        data: {
          totalAttempts: results.size,
          successful,
          failed,
          results: Array.from(results.entries()).map(([_agentId, status]) => status),
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Bulk funding failed',
      });
    }
  });
};
