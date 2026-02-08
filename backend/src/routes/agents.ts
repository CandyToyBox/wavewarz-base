import { FastifyPluginAsync } from 'fastify';
import { BattleService } from '../services/battle.service.js';
import { MoltbookService } from '../services/moltbook.service.js';
import { VerifyAgentInputSchema } from '../types/index.js';
import { z } from 'zod';

const AgentIdParamsSchema = z.object({
  id: z.string().min(1),
});

const LeaderboardQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export const agentsRoutes: FastifyPluginAsync<{
  battleService: BattleService;
  moltbookService: MoltbookService;
}> = async (fastify, opts) => {
  const { battleService, moltbookService } = opts;

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
      // Try to get from our database first
      let agent = await battleService.getAgent(params.data.id);

      // If not found locally, try Moltbook
      if (!agent) {
        const moltbookProfile = await moltbookService.getAgentProfile(params.data.id);
        if (moltbookProfile) {
          return {
            success: true,
            data: {
              ...moltbookProfile,
              wins: 0,
              losses: 0,
              totalVolume: '0',
              createdAt: new Date(),
            },
          };
        }

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
   * POST /api/agents/verify - Verify agent wallet ownership via Moltbook
   */
  fastify.post('/verify', async (request, reply) => {
    const body = VerifyAgentInputSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    try {
      // Check if agent is valid on Moltbook
      const isValid = await moltbookService.isValidMoltbookAgent(body.data.agentId);
      if (!isValid) {
        return reply.status(400).send({
          success: false,
          error: 'Agent is not a valid Moltbook agent',
        });
      }

      // Verify wallet ownership
      const walletVerified = await moltbookService.verifyAgentWallet(
        body.data.agentId,
        body.data.walletAddress
      );

      if (!walletVerified) {
        return reply.status(400).send({
          success: false,
          error: 'Agent does not own this wallet',
        });
      }

      // Get full profile
      const profile = await moltbookService.getAgentProfile(body.data.agentId);

      return {
        success: true,
        data: {
          verified: true,
          agent: profile,
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
   * GET /api/agents/music-capable - Get list of music-capable agents from Moltbook
   */
  fastify.get('/music-capable', async (request, reply) => {
    const query = LeaderboardQuerySchema.safeParse(request.query);
    const limit = query.success ? query.data.limit || 20 : 20;

    try {
      const agents = await moltbookService.getMusicAgents(limit);
      return { success: true, data: agents };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get music-capable agents',
      });
    }
  });
};
