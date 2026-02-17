import { FastifyPluginAsync } from 'fastify';
import { LeaderboardService } from '../services/leaderboard.service.js';

export const leaderboardRoutes: FastifyPluginAsync<{
  leaderboardService: LeaderboardService;
}> = async (fastify, opts) => {
  const { leaderboardService } = opts;

  /**
   * GET /api/leaderboard/overall - Get overall leaderboard (win rate + volume)
   */
  fastify.get('/overall', async (request, reply) => {
    const limit = Math.min(parseInt((request.query as any).limit || '50', 10), 500);

    try {
      const leaderboard = await leaderboardService.getOverallLeaderboard(limit);
      return {
        success: true,
        data: leaderboard,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch overall leaderboard',
      });
    }
  });

  /**
   * GET /api/leaderboard/volume - Get leaderboard by trading volume
   */
  fastify.get('/volume', async (request, reply) => {
    const limit = Math.min(parseInt((request.query as any).limit || '50', 10), 500);

    try {
      const leaderboard = await leaderboardService.getVolumeLeaderboard(limit);
      return {
        success: true,
        data: leaderboard,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch volume leaderboard',
      });
    }
  });

  /**
   * GET /api/leaderboard/streaks - Get leaderboard by win streaks
   */
  fastify.get('/streaks', async (request, reply) => {
    const limit = Math.min(parseInt((request.query as any).limit || '50', 10), 500);

    try {
      const leaderboard = await leaderboardService.getStreakLeaderboard(limit);
      return {
        success: true,
        data: leaderboard,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch streak leaderboard',
      });
    }
  });

  /**
   * GET /api/leaderboard/profitability - Get leaderboard by profitability
   */
  fastify.get('/profitability', async (request, reply) => {
    const limit = Math.min(parseInt((request.query as any).limit || '50', 10), 500);

    try {
      const leaderboard = await leaderboardService.getProfitabilityLeaderboard(limit);
      return {
        success: true,
        data: leaderboard,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch profitability leaderboard',
      });
    }
  });

  /**
   * GET /api/leaderboard/agent/:agentId - Get comprehensive stats for single agent
   */
  fastify.get('/agent/:agentId', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };

    try {
      const stats = await leaderboardService.getAgentStats(agentId);

      if (!stats) {
        return reply.status(404).send({
          success: false,
          error: `Agent ${agentId} not found`,
        });
      }

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch agent stats',
      });
    }
  });

  /**
   * GET /api/leaderboard/top - Get top 10 agents summary
   */
  fastify.get('/top', async (request, reply) => {
    const limit = Math.min(parseInt((request.query as any).limit || '10', 10), 50);

    try {
      const topAgents = await leaderboardService.getTopAgents(limit);
      return {
        success: true,
        data: {
          title: 'Top Agents',
          description: 'Best performing agents by win rate and trading volume',
          agents: topAgents,
          generatedAt: new Date(),
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch top agents',
      });
    }
  });
};
