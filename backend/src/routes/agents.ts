import { FastifyPluginAsync } from 'fastify';
import { BattleService } from '../services/battle.service.js';
import { AgentService } from '../services/agent.service.js';
import { z } from 'zod';

const AgentIdParamsSchema = z.object({
  id: z.string().min(1),
});

const LeaderboardQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

const RegisterAgentSchema = z.object({
  agentId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  displayName: z.string().max(100).optional(),
  avatarUrl: z.string().url().optional(),
});

const PrepareBuyTxSchema = z.object({
  battleId: z.number().int().positive(),
  artistA: z.boolean(),
  amount: z.string().regex(/^\d+$/),
  minTokensOut: z.string().regex(/^\d+$/).default('0'),
});

const PrepareSellTxSchema = z.object({
  battleId: z.number().int().positive(),
  artistA: z.boolean(),
  tokenAmount: z.string().regex(/^\d+$/),
  minAmountOut: z.string().regex(/^\d+$/).default('0'),
});

const PrepareClaimTxSchema = z.object({
  battleId: z.number().int().positive(),
});

export const agentsRoutes: FastifyPluginAsync<{
  battleService: BattleService;
  agentService: AgentService;
}> = async (fastify, opts) => {
  const { battleService, agentService } = opts;

  /**
   * GET /api/agents/:id - Get agent profile
   */
  fastify.get('/:id', async (request, reply) => {
    const params = AgentIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid agent ID',
      });
    }

    try {
      const agent = await battleService.getAgent(params.data.id);

      if (!agent) {
        return reply.status(404).send({
          success: false,
          error: 'Agent not found',
        });
      }

      return { success: true, data: agent };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get agent',
      });
    }
  });

  /**
   * GET /api/agents/:id/battles - Get agent's battle history
   */
  fastify.get('/:id/battles', async (request, reply) => {
    const params = AgentIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid agent ID',
      });
    }

    try {
      const battles = await battleService.getAgentBattles(params.data.id);
      return { success: true, data: battles };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get agent battles',
      });
    }
  });

  /**
   * POST /api/agents/verify - Verify agent exists in DB with matching wallet
   */
  fastify.post('/verify', async (request, reply) => {
    const VerifySchema = z.object({
      agentId: z.string().min(1),
      walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    });

    const body = VerifySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    try {
      const agent = await battleService.getAgent(body.data.agentId);
      if (!agent) {
        return reply.status(400).send({
          success: false,
          error: 'Agent not found',
        });
      }

      const walletMatch = agent.walletAddress.toLowerCase() === body.data.walletAddress.toLowerCase();
      if (!walletMatch) {
        return reply.status(400).send({
          success: false,
          error: 'Wallet address does not match registered agent',
        });
      }

      return {
        success: true,
        data: {
          verified: true,
          agent,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to verify agent',
      });
    }
  });

  /**
   * GET /api/agents/leaderboard - Get top agents by wins
   */
  fastify.get('/leaderboard', async (request, reply) => {
    const query = LeaderboardQuerySchema.safeParse(request.query);
    const limit = query.success ? query.data.limit || 20 : 20;

    try {
      const agents = await battleService.getLeaderboard(limit);
      return { success: true, data: agents };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get leaderboard',
      });
    }
  });

  /**
   * POST /api/agents/register - Open registration for any AI agent (BYOW)
   */
  fastify.post('/register', async (request, reply) => {
    const body = RegisterAgentSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    try {
      const agent = await agentService.registerAgent(
        body.data.agentId,
        body.data.walletAddress,
        body.data.displayName,
        body.data.avatarUrl
      );
      return reply.status(201).send({ success: true, data: agent });
    } catch (error) {
      fastify.log.error(error);
      const message = error instanceof Error ? error.message : 'Failed to register agent';
      const status = message.includes('already registered') || message.includes('already taken') ? 409 : 500;
      return reply.status(status).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * POST /api/agents/:id/prepare-buy - Get unsigned buyShares tx data (BYOW)
   */
  fastify.post('/:id/prepare-buy', async (request, reply) => {
    const params = AgentIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ success: false, error: 'Invalid agent ID' });
    }

    const body = PrepareBuyTxSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    try {
      const agent = await agentService.getAgent(params.data.id);
      if (!agent) {
        return reply.status(404).send({ success: false, error: 'Agent not registered' });
      }

      const txData = agentService.prepareBuyTx(
        body.data.battleId,
        body.data.artistA,
        body.data.amount,
        body.data.minTokensOut
      );

      return { success: true, data: { ...txData, from: agent.walletAddress } };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to prepare transaction' });
    }
  });

  /**
   * POST /api/agents/:id/prepare-sell - Get unsigned sellShares tx data (BYOW)
   */
  fastify.post('/:id/prepare-sell', async (request, reply) => {
    const params = AgentIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ success: false, error: 'Invalid agent ID' });
    }

    const body = PrepareSellTxSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    try {
      const agent = await agentService.getAgent(params.data.id);
      if (!agent) {
        return reply.status(404).send({ success: false, error: 'Agent not registered' });
      }

      const txData = agentService.prepareSellTx(
        body.data.battleId,
        body.data.artistA,
        body.data.tokenAmount,
        body.data.minAmountOut
      );

      return { success: true, data: { ...txData, from: agent.walletAddress } };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to prepare transaction' });
    }
  });

  /**
   * POST /api/agents/:id/prepare-claim - Get unsigned claimShares tx data (BYOW)
   */
  fastify.post('/:id/prepare-claim', async (request, reply) => {
    const params = AgentIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ success: false, error: 'Invalid agent ID' });
    }

    const body = PrepareClaimTxSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    try {
      const agent = await agentService.getAgent(params.data.id);
      if (!agent) {
        return reply.status(404).send({ success: false, error: 'Agent not registered' });
      }

      const txData = agentService.prepareClaimTx(body.data.battleId);

      return { success: true, data: { ...txData, from: agent.walletAddress } };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to prepare transaction' });
    }
  });
};
