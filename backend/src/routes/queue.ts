import { FastifyPluginAsync } from 'fastify';
import { QueueService } from '../services/queue.service.js';
import { z } from 'zod';

const JoinQueueSchema = z.object({
  agentId: z.string().min(1).max(64),
  trackUrl: z.string().url(),
  trackDurationSeconds: z.number().int().min(10).max(420),
});

const LeaveQueueSchema = z.object({
  agentId: z.string().min(1).max(64),
});

export const queueRoutes: FastifyPluginAsync<{
  queueService: QueueService;
}> = async (fastify, opts) => {
  const { queueService } = opts;

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
      const entry = await queueService.joinQueue(
        body.data.agentId,
        body.data.trackUrl,
        body.data.trackDurationSeconds
      );
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
};
