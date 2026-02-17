/**
 * Agent Trading Routes
 * Control and monitor autonomous agent trading
 */

import type { FastifyInstance } from 'fastify';
import type { AgentTradingEngine } from '../services/agent-trading-engine.js';

export async function agentTradingRoutes(
  fastify: FastifyInstance,
  options: { agentTradingEngine: AgentTradingEngine }
) {
  const { agentTradingEngine } = options;

  /**
   * GET /api/trading/status
   * Get overall trading engine status
   */
  fastify.get('/status', async (_request, reply) => {
    return reply.send({
      success: true,
      data: {
        status: 'running',
        message: 'Agent Trading Engine is monitoring battles',
        timestamp: new Date().toISOString(),
      },
    });
  });

  /**
   * GET /api/trading/battles/:battleId/agent/:agentId
   * Get trading stats for an agent in a specific battle
   */
  fastify.get<{ Params: { battleId: string; agentId: string } }>(
    '/battles/:battleId/agent/:agentId',
    async (request, reply) => {
      const battleId = parseInt(request.params.battleId, 10);
      const { agentId } = request.params;

      if (isNaN(battleId)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid battle ID',
        });
      }

      try {
        const stats = await agentTradingEngine.getAgentBattleStats(agentId, battleId);

        if (!stats) {
          return reply.status(404).send({
            success: false,
            error: 'No trading stats found for this agent in this battle',
          });
        }

        return reply.send({
          success: true,
          data: {
            agentId,
            battleId,
            trades: stats.trades,
            balance: stats.balance.toString(),
            tokensHeld: stats.tokensHeld.toString(),
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({
          success: false,
          error: errorMsg,
        });
      }
    }
  );

  /**
   * POST /api/trading/start
   * Start the trading engine (admin only)
   */
  fastify.post('/start', async (request, reply) => {
    const adminKey = request.headers['x-admin-key'];

    if (adminKey !== process.env.ADMIN_API_KEY) {
      return reply.status(403).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    try {
      await agentTradingEngine.start();
      return reply.send({
        success: true,
        data: {
          message: 'Agent Trading Engine started',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({
        success: false,
        error: errorMsg,
      });
    }
  });

  /**
   * POST /api/trading/stop
   * Stop the trading engine (admin only)
   */
  fastify.post('/stop', async (request, reply) => {
    const adminKey = request.headers['x-admin-key'];

    if (adminKey !== process.env.ADMIN_API_KEY) {
      return reply.status(403).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    try {
      await agentTradingEngine.stop();
      return reply.send({
        success: true,
        data: {
          message: 'Agent Trading Engine stopped',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(500).send({
        success: false,
        error: errorMsg,
      });
    }
  });
}
