import { FastifyPluginAsync } from 'fastify';
import { QueueService } from '../services/queue.service.js';
import { QueueMonitorService } from '../services/queue-monitor.service.js';
import { MatchmakingService } from '../services/matchmaking.service.js';
import { WalletFundingService } from '../services/wallet-funding.service.js';
import { z } from 'zod';

const JoinQueueSchema = z.object({
  agentId: z.string().min(1).max(64),
  trackUrl: z.string().url(),
  trackDurationSeconds: z.number().int().min(10).max(420),
});

const LeaveQueueSchema = z.object({
  agentId: z.string().min(1).max(64),
});

const UpdatePreferencesSchema = z.object({
  agentId: z.string().min(1).max(64),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  preferredStrategy: z.enum(['aggressive', 'strategic', 'any']).optional(),
});

export const queueRoutes: FastifyPluginAsync<{
  queueService: QueueService;
  queueMonitorService?: QueueMonitorService;
  matchmakingService?: MatchmakingService;
  walletFundingService?: WalletFundingService;
}> = async (fastify, opts) => {
  const { queueService, queueMonitorService, matchmakingService, walletFundingService } = opts;

  /**
   * GET /api/queue - Get current queue status
   */
  fastify.get('/', async (_request, _reply) => {
    try {
      const status = await queueService.getQueueStatus();
      return { success: true, data: status };
    } catch (error) {
      fastify.log.error(error);
      return _reply.status(500).send({
        success: false,
        error: 'Failed to get queue status',
      });
    }
  });

  /**
   * POST /api/queue/join - Join the battle queue
   */
  fastify.post('/join', async (request, reply) => {
    const body = JoinQueueSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    try {
      const { agentId, trackUrl, trackDurationSeconds } = body.data;

      // Check wallet and auto-fund if needed
      if (walletFundingService) {
        try {
          // Get agent wallet from database
          const agentResult = await (queueService as any).pool.query(
            'SELECT wallet_address FROM base_agents WHERE agent_id = $1',
            [agentId]
          );

          if (agentResult.rows.length > 0) {
            const walletAddress = agentResult.rows[0].wallet_address;

            // Auto-fund if balance is below minimum
            const fundingStatus = await walletFundingService.autoFundIfNeeded(agentId, walletAddress, 0.01);

            if (!fundingStatus.isFunded && fundingStatus.balance < '0.01') {
              return reply.status(402).send({
                success: false,
                error: 'Insufficient wallet balance for trading',
                data: {
                  currentBalance: fundingStatus.balance,
                  requiredBalance: '0.01',
                  fundingStatus: fundingStatus.status,
                },
              });
            }
          }
        } catch (fundingError) {
          fastify.log.warn({ err: fundingError }, 'Wallet funding check failed, proceeding anyway');
          // Don't block queue join if funding service fails
        }
      }

      const entry = await queueService.joinQueue(agentId, trackUrl, trackDurationSeconds);
      return reply.status(201).send({ success: true, data: entry });
    } catch (error) {
      fastify.log.error(error);
      const message = error instanceof Error ? error.message : 'Failed to join queue';
      const status = message.includes('already') || message.includes('not registered') || message.includes('exceeds') ? 400 : 500;
      return reply.status(status).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * POST /api/queue/leave - Leave the battle queue
   */
  fastify.post('/leave', async (request, reply) => {
    const body = LeaveQueueSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    try {
      await queueService.leaveQueue(body.data.agentId);
      return { success: true, data: { message: 'Left the queue' } };
    } catch (error) {
      fastify.log.error(error);
      const message = error instanceof Error ? error.message : 'Failed to leave queue';
      return reply.status(400).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * GET /api/queue/stats - Get queue statistics with matchmaking quality
   */
  fastify.get('/stats', async (_request, reply) => {
    if (!queueMonitorService) {
      return reply.status(503).send({
        success: false,
        error: 'Queue monitor service not available',
      });
    }

    try {
      const stats = await queueMonitorService.getQueueStats();
      return { success: true, data: stats };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get queue statistics',
      });
    }
  });

  /**
   * GET /api/queue/agent/:agentId/stats - Get agent matchmaking statistics
   */
  fastify.get('/agent/:agentId/stats', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };

    if (!queueMonitorService) {
      return reply.status(503).send({
        success: false,
        error: 'Queue monitor service not available',
      });
    }

    try {
      const stats = await queueMonitorService.getAgentMatchStats(agentId);
      if (!stats) {
        return reply.status(404).send({
          success: false,
          error: 'Agent not found in matchmaking statistics',
        });
      }
      return { success: true, data: stats };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get agent statistics',
      });
    }
  });

  /**
   * PUT /api/queue/agent/:agentId/preferences - Update agent matchmaking preferences
   */
  fastify.put('/agent/:agentId/preferences', async (request, reply) => {
    const { agentId } = request.params as { agentId: string };
    const body = UpdatePreferencesSchema.safeParse({ agentId, ...(request.body as Record<string, unknown>) });

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    if (!queueMonitorService) {
      return reply.status(503).send({
        success: false,
        error: 'Queue monitor service not available',
      });
    }

    try {
      const { skillLevel, preferredStrategy } = body.data;
      await queueMonitorService.updateAgentPreferences(agentId, skillLevel, preferredStrategy);
      return { success: true, data: { message: 'Preferences updated' } };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to update agent preferences',
      });
    }
  });

  /**
   * POST /api/queue/monitor/start - Start the queue monitoring (admin only)
   */
  fastify.post('/monitor/start', async (request, reply) => {
    const apiKey = (request.headers['x-api-key'] || '') as string;
    const adminKey = process.env.ADMIN_API_KEY || 'dev-api-key';

    if (apiKey !== adminKey) {
      return reply.status(403).send({
        success: false,
        error: 'Unauthorized - invalid API key',
      });
    }

    if (!queueMonitorService) {
      return reply.status(503).send({
        success: false,
        error: 'Queue monitor service not available',
      });
    }

    try {
      await queueMonitorService.start();
      return { success: true, data: { message: 'Queue monitor started' } };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to start queue monitor',
      });
    }
  });

  /**
   * POST /api/queue/monitor/stop - Stop the queue monitoring (admin only)
   */
  fastify.post('/monitor/stop', async (request, reply) => {
    const apiKey = (request.headers['x-api-key'] || '') as string;
    const adminKey = process.env.ADMIN_API_KEY || 'dev-api-key';

    if (apiKey !== adminKey) {
      return reply.status(403).send({
        success: false,
        error: 'Unauthorized - invalid API key',
      });
    }

    if (!queueMonitorService) {
      return reply.status(503).send({
        success: false,
        error: 'Queue monitor service not available',
      });
    }

    try {
      await queueMonitorService.stop();
      return { success: true, data: { message: 'Queue monitor stopped' } };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to stop queue monitor',
      });
    }
  });
};
