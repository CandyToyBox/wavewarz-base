// Force IPv4 DNS resolution — required for Railway (IPv6 to Supabase is blocked)
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { config } from 'dotenv';

// Load .env first (for DATABASE_URL bootstrap)
config();

import { loadSecretsFromVault } from './vault.js';
import { BlockchainService } from './services/blockchain.service.js';
import { SunoService, MockSunoService } from './services/suno.service.js';
import { BattleService } from './services/battle.service.js';
import { AgentService } from './services/agent.service.js';
import { QueueService } from './services/queue.service.js';
import { cdpService } from './services/cdp.service.js';
import { elevenlabsService } from './services/elevenlabs.service.js';
import { TradeExecutor } from './services/trade-executor.js';
import { AgentTradingEngine } from './services/agent-trading-engine.js';
import { MatchmakingService } from './services/matchmaking.service.js';
import { QueueMonitorService } from './services/queue-monitor.service.js';
import { WalletFundingService } from './services/wallet-funding.service.js';
import { BattleLifecycleService } from './services/battle-lifecycle.service.js';
import { LeaderboardService } from './services/leaderboard.service.js';
import { battlesRoutes } from './routes/battles.js';
import { agentsRoutes } from './routes/agents.js';
import { musicRoutes } from './routes/music.js';
import { agentWalletRoutes } from './routes/agent-wallet.js';
import { queueRoutes } from './routes/queue.js';
import { agentTradingRoutes } from './routes/agent-trading.js';
import { walletFundingRoutes } from './routes/wallet-funding.js';
import { battleLifecycleRoutes } from './routes/battle-lifecycle.js';
import { leaderboardRoutes } from './routes/leaderboard.js';
import type { WsEvent } from './types/index.js';

// WebSocket clients per battle
const battleSubscribers = new Map<number, Set<WebSocket>>();

// WebSocket clients for queue updates
const queueSubscribers = new Set<WebSocket>();

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
    sunoService,
    process.env.WAVEWARZ_WALLET_ADDRESS || ''
  );

  const agentService = new AgentService(
    process.env.DATABASE_URL || '',
    process.env.WAVEWARZ_CONTRACT_ADDRESS || '',
    84532 // Base Sepolia chain ID
  );

  const queueService = new QueueService(
    process.env.DATABASE_URL || '',
    battleService,
    agentService,
    blockchainService,
    process.env.WAVEWARZ_WALLET_ADDRESS || '',
    process.env.WAVEWARZ_CONTRACT_ADDRESS || '',
    parseInt(process.env.MAX_CONCURRENT_BATTLES || '1', 10)
  );

  const tradeExecutor = new TradeExecutor(
    process.env.DATABASE_URL || '',
    blockchainService,
    cdpService,
    process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    process.env.WAVEWARZ_CONTRACT_ADDRESS || ''
  );

  const agentTradingEngine = new AgentTradingEngine(
    process.env.DATABASE_URL || '',
    blockchainService,
    battleService,
    tradeExecutor
  );

  const matchmakingService = new MatchmakingService(process.env.DATABASE_URL || '');

  const queueMonitorService = new QueueMonitorService(
    process.env.DATABASE_URL || '',
    queueService
  );

  const walletFundingService = new WalletFundingService(
    process.env.DATABASE_URL || '',
    process.env.BASE_RPC_URL || 'https://sepolia.base.org'
  );

  const battleLifecycleService = new BattleLifecycleService(
    process.env.DATABASE_URL || '',
    battleService,
    blockchainService,
    sunoService,
    agentService
  );

  const leaderboardService = new LeaderboardService(
    process.env.DATABASE_URL || ''
  );

  // ============================================
  // STEP 5: Register plugins and routes
  // ============================================
  // Register plugins
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await fastify.register(websocket);

  // Global error handler
  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error({ err: error }, 'Unhandled error');
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      success: false,
      error: statusCode === 429
        ? 'Rate limit exceeded. Try again later.'
        : isDev
          ? error.message
          : 'Internal server error',
    });
  });

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
    agentService,
  });

  await fastify.register(musicRoutes, {
    prefix: '/api/music',
    sunoService,
    adminApiKey: process.env.ADMIN_API_KEY || 'dev-api-key',
  });

  // Queue routes with matchmaking integration
  await fastify.register(queueRoutes, {
    prefix: '/api/queue',
    queueService,
    queueMonitorService,
    matchmakingService,
    walletFundingService,
  });

  // Agent wallet routes (for WAVEX & NOVA)
  await fastify.register(agentWalletRoutes, {
    prefix: '/api/agent-wallets',
  });

  // Agent trading routes (monitoring and control)
  await fastify.register(agentTradingRoutes, {
    prefix: '/api/trading',
    agentTradingEngine,
    tradeExecutor,
  });

  // Wallet funding routes (auto-fund agents with testnet ETH)
  await fastify.register(walletFundingRoutes, {
    prefix: '/api/wallet',
    walletFundingService,
  });

  // Battle lifecycle routes (start, monitor, end battles)
  await fastify.register(battleLifecycleRoutes, {
    prefix: '/api/battles',
    battleLifecycleService,
  });

  // Leaderboard routes (competitive rankings and stats)
  await fastify.register(leaderboardRoutes, {
    prefix: '/api/leaderboard',
    leaderboardService,
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

  // Start Agent Trading Engine
  fastify.log.info('Starting Agent Trading Engine...');
  await agentTradingEngine.start();

  // Start Queue Monitor for intelligent matchmaking
  fastify.log.info('Starting Queue Monitor Service...');
  await queueMonitorService.start();

  // WebSocket endpoint for real-time battle updates
  fastify.get('/ws/battles/:battleId', { websocket: true }, (connection, request) => {
    const ws = connection.socket;
    const battleId = parseInt((request.params as { battleId: string }).battleId, 10);

    if (isNaN(battleId)) {
      ws.close();
      return;
    }

    // Add to subscribers
    if (!battleSubscribers.has(battleId)) {
      battleSubscribers.set(battleId, new Set());
    }
    battleSubscribers.get(battleId)!.add(ws as unknown as WebSocket);

    fastify.log.info(`WebSocket client connected to battle ${battleId}`);

    // Send initial battle state
    battleService.getBattle(battleId).then(battle => {
      if (battle && ws.readyState === 1) { // 1 = OPEN
        ws.send(JSON.stringify({
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
    ws.on('close', () => {
      battleSubscribers.get(battleId)?.delete(ws as unknown as WebSocket);
      fastify.log.info(`WebSocket client disconnected from battle ${battleId}`);
    });

    // Ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === 1) {
        ws.ping();
      }
    }, parseInt(process.env.WS_PING_INTERVAL || '30000', 10));

    ws.on('close', () => {
      clearInterval(pingInterval);
    });
  });

  // WebSocket endpoint for real-time queue updates
  fastify.get('/ws/queue', { websocket: true }, (connection) => {
    const ws = connection.socket;
    queueSubscribers.add(ws as unknown as WebSocket);

    fastify.log.info('WebSocket client connected to queue');

    // Send initial queue status
    queueMonitorService.getQueueStats().then(stats => {
      if (ws.readyState === 1) { // 1 = OPEN
        ws.send(JSON.stringify({
          type: 'queue_status',
          data: stats,
          timestamp: new Date().toISOString(),
        }));
      }
    }).catch(err => {
      fastify.log.error('Failed to send initial queue status:', err);
    });

    // Handle client disconnect
    ws.on('close', () => {
      queueSubscribers.delete(ws as unknown as WebSocket);
      fastify.log.info('WebSocket client disconnected from queue');
    });

    // Ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === 1) {
        ws.ping();
      }
    }, parseInt(process.env.WS_PING_INTERVAL || '30000', 10));

    ws.on('close', () => {
      clearInterval(pingInterval);
    });
  });

  // Function to broadcast queue updates to all subscribers
  function broadcastQueueUpdate(update: any) {
    const message = JSON.stringify({
      type: 'queue_update',
      data: update,
      timestamp: new Date().toISOString(),
    });

    for (const ws of queueSubscribers) {
      if (ws.readyState === 1) { // 1 = OPEN
        ws.send(message);
      }
    }
  }

  // Periodically broadcast queue stats to subscribers
  const queueUpdateInterval = setInterval(async () => {
    if (queueSubscribers.size > 0) {
      try {
        const stats = await queueMonitorService.getQueueStats();
        broadcastQueueUpdate(stats);
      } catch (err) {
        fastify.log.error({ err }, 'Failed to broadcast queue update');
      }
    }
  }, 5000); // Update every 5 seconds

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

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down...`);
    blockchainService.removeAllListeners();
    clearInterval(queueUpdateInterval);
    queueSubscribers.clear();
    await agentTradingEngine.stop();
    await queueMonitorService.stop();
    await battleLifecycleService.close();
    await leaderboardService.close();
    await fastify.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

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

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
