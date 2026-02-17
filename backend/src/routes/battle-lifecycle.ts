import { FastifyPluginAsync } from 'fastify';
import { BattleLifecycleService } from '../services/battle-lifecycle.service.js';
import { z } from 'zod';

const StartBattleSchema = z.object({
  battleId: z.number().int().positive(),
});

const EndBattleSchema = z.object({
  battleId: z.number().int().positive(),
});

const GetBattleProgressSchema = z.object({
  battleId: z.number().int().positive(),
});

export const battleLifecycleRoutes: FastifyPluginAsync<{
  battleLifecycleService: BattleLifecycleService;
}> = async (fastify, opts) => {
  const { battleLifecycleService } = opts;

  /**
   * POST /api/battles/start - Start a battle with music generation
   */
  fastify.post('/start', async (request, reply) => {
    const body = StartBattleSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    try {
      const { battleId } = body.data;
      const phase = await battleLifecycleService.startBattle(battleId);

      return reply.status(202).send({
        success: true,
        data: {
          battleId,
          ...phase,
        },
      });
    } catch (error) {
      fastify.log.error(error);
      const message = error instanceof Error ? error.message : 'Failed to start battle';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * POST /api/battles/end - Manually end a battle and settle
   */
  fastify.post('/end', async (request, reply) => {
    const body = EndBattleSchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    try {
      const { battleId } = body.data;
      const settlement = await battleLifecycleService.endBattle(battleId);

      return {
        success: true,
        data: settlement,
      };
    } catch (error) {
      fastify.log.error(error);
      const message = error instanceof Error ? error.message : 'Failed to end battle';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * GET /api/battles/:battleId/progress - Get real-time battle progress
   */
  fastify.get('/:battleId/progress', async (request, reply) => {
    const { battleId } = request.params as { battleId: string };
    const id = parseInt(battleId, 10);

    if (isNaN(id)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid battle ID',
      });
    }

    try {
      const progress = await battleLifecycleService.getBattleProgress(id);
      return {
        success: true,
        data: progress,
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(404).send({
        success: false,
        error: 'Battle not found',
      });
    }
  });

  /**
   * GET /api/battles/:battleId/phase - Get current battle phase
   */
  fastify.get('/:battleId/phase', async (request, reply) => {
    const { battleId } = request.params as { battleId: string };
    const id = parseInt(battleId, 10);

    if (isNaN(id)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid battle ID',
      });
    }

    try {
      const phase = await battleLifecycleService.getBattlePhase(id);
      return {
        success: true,
        data: {
          battleId: id,
          phase,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get battle phase',
      });
    }
  });
};
