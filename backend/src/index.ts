import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from 'dotenv';

// Load .env first (for DATABASE_URL bootstrap)
config();

import { loadSecretsFromVault } from './vault.js';
import { BlockchainService } from './services/blockchain.service.js';
import { MoltbookService, MockMoltbookService } from './services/moltbook.service.js';
import { SunoService, MockSunoService } from './services/suno.service.js';
import { BattleService } from './services/battle.service.js';
import { cdpService } from './services/cdp.service.js';
import { moltcloudService } from './services/moltcloud.service.js';
import { elevenlabsService } from './services/elevenlabs.service.js';
import { registerMoltbookAuth } from './middleware/moltbook-auth.js';
import { battlesRoutes } from './routes/battles.js';
import { agentsRoutes } from './routes/agents.js';
import { musicRoutes } from './routes/music.js';
import { agentWalletRoutes } from './routes/agent-wallet.js';
import type { WsEvent } from './types/index.js';

// WebSocket clients per battle
const battleSubscribers = new Map<number, Set<WebSocket>>();

async function start() {
  // ============================================
  // STEP 1: Load secrets from Supabase Vault
  // ============================================
  console.log('🔐 Loading secrets from Supabase Vault...');
  await loadSecretsFromVault();

  // ============================================
  // STEP 2: Initialize configuration after secrets loaded
  // ============================================
  const PORT = parseInt(process.env.PORT || '3001', 10);
  const HOST = process.env.HOST || '0.0.0.0';
  const isDev = process.env.NODE_ENV !== 'production';

  // ============================================
  // STEP 3: Initialize Fastify
  // ============================================
  const fastify = Fastify({
    logger: {
      transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
  });

  // ============================================
  // STEP 4: Initialize services (now with Vault secrets available)
  // ============================================
  const blockchainService = new BlockchainService(
    process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    process.env.WAVEWARZ_CONTRACT_ADDRESS || '',
    process.env.ADMIN_PRIVATE_KEY
  );

  const moltbookService = isDev
    ? new MockMoltbookService()
    : new MoltbookService(
        process.env.MOLTBOOK_API_URL || '',
        process.env.MOLTBOOK_API_KEY || ''
      );

  const sunoService = isDev
    ? new MockSunoService()
    : new SunoService(
        process.env.SUNO_API_URL || '',
        process.env.SUNO_API_KEY || ''
      );

  const battleService = new BattleService(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    blockchainService,
    moltbookService,
    sunoService,
    process.env.WAVEWARZ_WALLET_ADDRESS || ''
  );

  // ============================================
  // STEP 5: Register plugins and routes
  // ============================================
  // Register plugins
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  await fastify.register(websocket);

  // Register Moltbook authentication middleware
  await registerMoltbookAuth(fastify);

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // API routes
  await fastify.register(battlesRoutes, {
    prefix: '/api/battles',
    battleService,
    adminApiKey: process.env.ADMIN_API_KEY || 'dev-api-key',
  });

  await fastify.register(agentsRoutes, {
    prefix: '/api/agents',
    battleService,
    moltbookService,
  });

  await fastify.register(musicRoutes, {
    prefix: '/api/music',
    sunoService,
    adminApiKey: process.env.ADMIN_API_KEY || 'dev-api-key',
  });

  // Agent wallet routes (for WAVEX & NOVA)
  await fastify.register(agentWalletRoutes, {
    prefix: '/api/agent-wallets',
  });

  // Initialize AI agent wallets via CDP (WAVEX & NOVA)
  fastify.log.info('Initializing AI agent wallets via CDP...');
  await cdpService.initializeAgentWallets();

  const agentAddresses = cdpService.getAllAgentAddresses();
  for (const [agentId, address] of Object.entries(agentAddresses)) {
    fastify.log.info(`Agent ${agentId} wallet: ${address}`);
  }

  // Check ElevenLabs service status
  if (elevenlabsService.isConfigured()) {
    fastify.log.info('ElevenLabs voice synthesis enabled');
  } else {
    fastify.log.warn('ElevenLabs not configured - voice synthesis disabled');
  }

  // Check MoltCloud service
  try {
    const version = await moltcloudService.checkVersion();
    fastify.log.info(`MoltCloud API connected (v${version.version})`);
  } catch {
    fastify.log.warn('MoltCloud not available - music generation via MoltCloud disabled');
  }

  // WebSocket endpoint for real-time battle updates
  fastify.get('/ws/battles/:battleId', { websocket: true }, (connection, request) => {
    const battleId = parseInt((request.params as { battleId: string }).battleId, 10);

    if (isNaN(battleId)) {
      connection.close();
      return;
    }

    // Add to subscribers
    if (!battleSubscribers.has(battleId)) {
      battleSubscribers.set(battleId, new Set());
    }
    battleSubscribers.get(battleId)!.add(connection as unknown as WebSocket);

    fastify.log.info(`WebSocket client connected to battle ${battleId}`);

    // Send initial battle state
    battleService.getBattle(battleId).then(battle => {
      if (battle && connection.readyState === 1) { // 1 = OPEN
        connection.send(JSON.stringify({
          type: 'battle_update',
          battleId,
          data: {
            artistAPool: battle.artistAPool,
            artistBPool: battle.artistBPool,
            artistASupply: battle.artistASupply,
            artistBSupply: battle.artistBSupply,
          },
        }));
      }
    });

    // Handle client disconnect
    connection.on('close', () => {
      battleSubscribers.get(battleId)?.delete(connection as unknown as WebSocket);
      fastify.log.info(`WebSocket client disconnected from battle ${battleId}`);
    });

    // Ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (connection.readyState === 1) {
        connection.ping();
      }
    }, parseInt(process.env.WS_PING_INTERVAL || '30000', 10));

    connection.on('close', () => {
      clearInterval(pingInterval);
    });
  });

  // Subscribe to blockchain events and broadcast to WebSocket clients
  blockchainService.onSharesPurchased((battleId, trader, artistA, tokenAmount, paymentAmount) => {
    const event: WsEvent = {
      type: 'trade',
      battleId: Number(battleId),
      data: {
        traderWallet: trader,
        artistSide: artistA ? 'A' : 'B',
        tradeType: 'buy',
        tokenAmount: tokenAmount.toString(),
        paymentAmount: paymentAmount.toString(),
        timestamp: new Date(),
      },
    };

    broadcastToBattle(Number(battleId), event);

    // Sync battle state after trade
    battleService.syncBattleFromChain(Number(battleId)).catch(err => {
      fastify.log.error('Failed to sync battle after trade:', err);
    });
  });

  blockchainService.onSharesSold((battleId, trader, artistA, tokenAmount, paymentReceived) => {
    const event: WsEvent = {
      type: 'trade',
      battleId: Number(battleId),
      data: {
        traderWallet: trader,
        artistSide: artistA ? 'A' : 'B',
        tradeType: 'sell',
        tokenAmount: tokenAmount.toString(),
        paymentAmount: paymentReceived.toString(),
        timestamp: new Date(),
      },
    };

    broadcastToBattle(Number(battleId), event);

    // Sync battle state after trade
    battleService.syncBattleFromChain(Number(battleId)).catch(err => {
      fastify.log.error('Failed to sync battle after trade:', err);
    });
  });

  blockchainService.onBattleEnded((battleId, winnerIsArtistA, artistAPool, artistBPool) => {
    const event: WsEvent = {
      type: 'battle_ended',
      battleId: Number(battleId),
      data: {
        winnerIsArtistA,
        artistAPool: artistAPool.toString(),
        artistBPool: artistBPool.toString(),
      },
    };

    broadcastToBattle(Number(battleId), event);
  });

  // Start server
  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`WaveWarz Base backend listening on ${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

function broadcastToBattle(battleId: number, event: WsEvent) {
  const subscribers = battleSubscribers.get(battleId);
  if (!subscribers) return;

  const message = JSON.stringify(event);
  for (const ws of subscribers) {
    if (ws.readyState === 1) { // 1 = OPEN
      ws.send(message);
    }
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  fastify.log.info('Received SIGTERM, shutting down...');
  blockchainService.removeAllListeners();
  await fastify.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  fastify.log.info('Received SIGINT, shutting down...');
  blockchainService.removeAllListeners();
  await fastify.close();
  process.exit(0);
});

start();
