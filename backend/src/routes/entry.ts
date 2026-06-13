import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { EntryCycleService } from '../services/entry-cycle.service.js';

/**
 * Entry-queue routes (always-on protocol model).
 *
 * - GET  /api/entry            current cycle + picks
 * - POST /api/entry/open       (admin) open a new cycle, source songs from Audius
 * - POST /api/entry/tick       (admin/cron) advance the state machine
 * - POST /api/entry/bet        place a pick (the open-access door)
 *
 * The bet endpoint is the x402 agent door: an `agent` pick with no `X-PAYMENT`
 * header gets a 402 with payment requirements; once the agent settles and
 * retries with the header, the pick is recorded. Humans place picks with their
 * wallet address (testnet auth is stubbed — see opens in the PR body).
 */

const numericString = z.string().regex(/^\d+$/, 'must be a positive integer string');

const BetSchema = z.object({
  actorType: z.enum(['agent', 'human']),
  actorId: z.string().min(1).max(128),       // agentId or wallet address
  sideIsArtistA: z.boolean(),
  maxBudgetWei: numericString,
  autonomy: z.enum(['agent', 'self']).optional(),
  controlsAgentId: z.string().min(1).max(128).optional(),
});

const OpenSchema = z.object({
  genre: z.string().min(1).max(40).optional(),
});

interface EntryRouteOpts {
  entryCycleService: EntryCycleService;
  adminApiKey: string;
  x402FeeWei: string;
  wavewarzWallet: string;
  network: 'base' | 'base-sepolia';
}

export const entryRoutes: FastifyPluginAsync<EntryRouteOpts> = async (fastify, opts) => {
  const { entryCycleService, adminApiKey, x402FeeWei, wavewarzWallet, network } = opts;

  const requireAdmin = (request: any, reply: any): boolean => {
    if (request.headers['x-api-key'] !== adminApiKey) {
      reply.status(401).send({ success: false, error: 'Unauthorized' });
      return false;
    }
    return true;
  };

  /** GET /api/entry — current cycle + picks */
  fastify.get('/', async (_request, reply) => {
    try {
      const current = await entryCycleService.getCurrentCycle();
      return { success: true, data: current };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Failed to load cycle' });
    }
  });

  /** POST /api/entry/open — admin: open a new cycle */
  fastify.post('/open', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = OpenSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ success: false, error: 'Invalid body', details: body.error.issues });
    }
    try {
      const cycle = await entryCycleService.openCycle(body.data.genre);
      return { success: true, data: cycle };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(409).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to open cycle',
      });
    }
  });

  /** POST /api/entry/tick — admin/cron: advance the state machine */
  fastify.post('/tick', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    try {
      await entryCycleService.tick();
      const current = await entryCycleService.getCurrentCycle();
      return { success: true, data: current };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ success: false, error: 'Tick failed' });
    }
  });

  /** POST /api/entry/bet — place a pick (open-access door) */
  fastify.post('/bet', async (request, reply) => {
    const body = BetSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ success: false, error: 'Invalid body', details: body.error.issues });
    }
    const input = body.data;

    // x402 agent door: agent picks must carry a settled payment.
    let x402TxHash: string | null = null;
    if (input.actorType === 'agent') {
      const paymentHeader = request.headers['x-payment'] as string | undefined;
      if (!paymentHeader) {
        // Demand payment, then the agent retries with X-PAYMENT.
        reply.header(
          'x-payment-required',
          JSON.stringify({
            amount: x402FeeWei,
            recipient: wavewarzWallet,
            reference: `entry-bet:${input.actorId}`,
            currency: 'ETH',
            network,
          })
        );
        return reply.status(402).send({
          success: false,
          error: 'Payment required to place an agent pick (x402).',
        });
      }
      // X-PAYMENT is a base64 JSON payload { txHash, reference, network, timestamp }.
      try {
        const decoded = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf8'));
        x402TxHash = decoded.txHash ?? null;
      } catch {
        return reply.status(400).send({ success: false, error: 'Malformed X-PAYMENT header' });
      }
      if (!x402TxHash) {
        return reply.status(400).send({ success: false, error: 'X-PAYMENT missing txHash' });
      }
    }

    try {
      const pick = await entryCycleService.placePick({
        actorType: input.actorType,
        actorId: input.actorId,
        sideIsArtistA: input.sideIsArtistA,
        maxBudgetWei: BigInt(input.maxBudgetWei),
        autonomy: input.autonomy,
        controlsAgentId: input.controlsAgentId ?? null,
        x402TxHash,
      });
      return { success: true, data: pick };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to place pick',
      });
    }
  });
};
