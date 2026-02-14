import { FastifyPluginAsync } from 'fastify';
import { SunoService } from '../services/suno.service.js';
import { GenerateMusicInputSchema } from '../types/index.js';
import { z } from 'zod';

const TrackIdParamsSchema = z.object({
  trackId: z.string().min(1),
});

export const musicRoutes: FastifyPluginAsync<{
  sunoService: SunoService;
  adminApiKey: string;
}> = async (fastify, opts) => {
  const { sunoService, adminApiKey } = opts;

  // Middleware to verify admin API key
  const verifyAdmin = async (request: { headers: Record<string, string | string[] | undefined> }) => {
    if (request.headers['x-api-key'] !== adminApiKey) {
      throw new Error('Unauthorized');
    }
  };

  /**
   * POST /api/music/generate - Generate a new track via SUNO (admin only)
   */
  fastify.post('/generate', async (request, reply) => {
    try {
      await verifyAdmin(request);
    } catch {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
      });
    }

    const body = GenerateMusicInputSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
        details: body.error.issues,
      });
    }

    try {
      const track = await sunoService.generateTrackWithRetry(body.data);
      return { success: true, data: track };
    } catch (error) {
      fastify.log.error(error);
      const message = error instanceof Error ? error.message : 'Failed to generate track';
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * GET /api/music/:trackId/status - Get track generation status
   */
  fastify.get('/:trackId/status', async (request, reply) => {
    const params = TrackIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid track ID',
      });
    }

    try {
      const status = await sunoService.getTrackStatus(params.data.trackId);
      return { success: true, data: status };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to get track status',
      });
    }
  });

  /**
   * POST /api/music/generate-battle-prompt - Generate a battle-ready prompt
   */
  fastify.post('/generate-battle-prompt', async (request, reply) => {
    const PromptInputSchema = z.object({
      artistName: z.string().min(1),
      style: z.enum(['hip-hop', 'electronic', 'rock', 'pop', 'r&b', 'jazz']),
      theme: z.string().optional(),
    });

    const body = PromptInputSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid request body',
      });
    }

    const prompt = SunoService.generateBattlePrompt(
      body.data.artistName,
      body.data.style,
      body.data.theme
    );

    return { success: true, data: { prompt } };
  });
};
