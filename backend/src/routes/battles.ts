import { FastifyPluginAsync } from 'fastify';
import { BattleService } from '../services/battle.service.js';
import {
  CreateBattleInputSchema,
  BattleStatusSchema,
} from '../types/index.js';
import { z } from 'zod';

const BattleIdParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

const ListBattlesQuerySchema = z.object({
  status: BattleStatusSchema.optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  pageSize: z.string().regex(/^\d+$/).transform(Number).optional(),
});

const EndBattleBodySchema = z.object({
  winnerIsArtistA: z.boolean(),
});

export const battlesRoutes: FastifyPluginAsync<{
  battleService: BattleService;
  adminApiKey: string;
}> = async (fastify, opts) => {
  const { battleService, adminApiKey } = opts;

  // Middleware to verify admin API key
  const verifyAdmin = async (request: { headers: Record<string, string | string[] | undefined> }) => {
    if (request.headers['x-api-key'] !== adminApiKey) {
      throw new Error('Unauthorized');
    }
  };

  /**
   * GET /api/battles - List battles
   */
  fastify.get('/', async (request, reply) => {
    const query = ListBattlesQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid query parameters',
      });
    }

    try {
      const { battles, total } = await battleService.listBattles({
        status: query.data.status,
        page: query.data.page,
        pageSize: query.data.pageSize,
      });

      return {
        success: true,
        data: {
          battles,
          total,
          page: query.data.page || 1,
          pageSize: query.data.pageSize || 20,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to list battles',
      });
    }
  });

  /**
   * GET /api/battles/:id - Get battle by ID
   */
  fastify.get('/:id', async (request, reply) => {
    const params = BattleIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid battle ID',
      });
    }

    try {
      const battle = await battleService.getBattle(params.data.id);
      if (!battle) {
        return reply.status(404).send({
          success: false,
          error: 'Battle not found',
        });
      }

      return { success: true, data: battle };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get battle',
      });
    }
  });

  /**
   * GET /api/battles/:id/trades - Get battle trades
   */
  fastify.get('/:id/trades', async (request, reply) => {
    const params = BattleIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid battle ID',
      });
    }

    try {
      const trades = await battleService.getBattleTrades(params.data.id);
      return { success: true, data: trades };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get trades',
      });
    }
  });

  /**
   * POST /api/battles - Create new battle (admin only)
   */
  fastify.post('/', async (request, reply) => {
    try {
      await verifyAdmin(request);
    } catch {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const body = CreateBattleInputSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    try {
      const battle = await battleService.createBattle(body.data);
      return reply.status(201).send({ success: true, data: battle });
    } catch (error) {
      fastify.log.error(error);
      const message = error instanceof Error ? error.message : 'Failed to create battle';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * POST /api/battles/:id/generate-music - Generate music for battle (admin only)
   */
  fastify.post('/:id/generate-music', async (request, reply) => {
    try {
      await verifyAdmin(request);
    } catch {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const params = BattleIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid battle ID',
      });
    }

    try {
      const tracks = await battleService.generateBattleMusic(params.data.id);
      return { success: true, data: tracks };
    } catch (error) {
      fastify.log.error(error);
      const message = error instanceof Error ? error.message : 'Failed to generate music';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * GET /api/battles/:id/token-balance/:wallet - Get trader's token balance for a battle
   */
  fastify.get('/:id/token-balance/:wallet', async (request, reply) => {
    const paramsSchema = z.object({
      id: z.string().regex(/^\d+$/).transform(Number),
      wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    });

    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid battle ID or wallet address',
      });
    }

    try {
      const balances = await battleService.getTraderTokenBalance(
        params.data.id,
        params.data.wallet
      );
      return { success: true, data: balances };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get token balance',
      });
    }
  });

  /**
   * POST /api/battles/:id/sync - Sync battle state from blockchain
   */
  fastify.post('/:id/sync', async (request, reply) => {
    const params = BattleIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid battle ID',
      });
    }

    try {
      const battle = await battleService.syncBattleFromChain(params.data.id);
      if (!battle) {
        return reply.status(404).send({
          success: false,
          error: 'Battle not found on chain',
        });
      }

      return { success: true, data: battle };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to sync battle',
      });
    }
  });

  /**
   * POST /api/battles/:id/end - End battle and declare winner (admin only)
   */
  fastify.post('/:id/end', async (request, reply) => {
    try {
      await verifyAdmin(request);
    } catch {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const params = BattleIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid battle ID',
      });
    }

    const body = EndBattleBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body - must include winnerIsArtistA boolean',
      });
    }

    try {
      const txHash = await battleService.endBattle(
        params.data.id,
        body.data.winnerIsArtistA
      );
      return { success: true, data: { txHash } };
    } catch (error) {
      fastify.log.error(error);
      const message = error instanceof Error ? error.message : 'Failed to end battle';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });
};
