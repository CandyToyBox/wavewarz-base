/**
 * Queue Service
 * Manages the battle queue for agent matchmaking.
 * Supports configurable concurrent battles — when 2 agents are in queue
 * and battle slots are available, auto-creates a battle.
 */

import { Pool } from 'pg';
import { BattleService } from './battle.service.js';
import { AgentService } from './agent.service.js';
import { BlockchainService } from './blockchain.service.js';
import { MusicValidationService } from './music-validation.service.js';

export interface QueueEntry {
  id: string;
  agentId: string;
  walletAddress: string;
  trackUrl: string;
  trackDurationSeconds: number;
  joinedAt: Date;
}

export class QueueService {
  private pool: Pool;
  private battleService: BattleService;
  private agentService: AgentService;
  private blockchain: BlockchainService;
  private wavewarzWallet: string;
  private contractAddress: string;
  private maxConcurrentBattles: number;

  constructor(
    databaseUrl: string,
    battleService: BattleService,
    agentService: AgentService,
    blockchain: BlockchainService,
    wavewarzWallet: string,
    contractAddress: string,
    maxConcurrentBattles: number = 1
  ) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
    this.battleService = battleService;
    this.agentService = agentService;
    this.blockchain = blockchain;
    this.wavewarzWallet = wavewarzWallet;
    this.contractAddress = contractAddress;
    this.maxConcurrentBattles = maxConcurrentBattles;
  }

  /**
   * Join the battle queue
   */
  async joinQueue(
    agentId: string,
    trackUrl: string,
    trackDurationSeconds: number
  ): Promise<QueueEntry> {
    // Validate agent exists
    const agent = await this.agentService.getAgent(agentId);
    if (!agent) {
      throw new Error('Agent not registered. Call POST /api/agents/register first.');
    }

    // Check agent is not in active battle
    if (agent.inActiveBattle) {
      throw new Error('Agent is already in an active battle');
    }

    // Validate song duration (max 7 minutes = 420 seconds)
    if (trackDurationSeconds > 420) {
      throw new Error('Song duration exceeds maximum of 7 minutes (420 seconds)');
    }

    if (trackDurationSeconds < 10) {
      throw new Error('Song duration must be at least 10 seconds');
    }

    // Validate track URL is accessible
    const urlCheck = await MusicValidationService.validateTrackUrl(trackUrl);
    if (!urlCheck.valid) {
      throw new Error(`Invalid track URL: ${urlCheck.error}`);
    }

    // Check if agent already in queue
    const existing = await this.pool.query(
      'SELECT id FROM battle_queue WHERE agent_id = $1',
      [agentId]
    );
    if (existing.rows.length > 0) {
      throw new Error('Agent is already in the queue');
    }

    // Check if we've hit the concurrent battle limit
    const activeBattles = await this.pool.query(
      "SELECT COUNT(*) as count FROM base_battles WHERE status IN ('pending', 'active')"
    );
    const activeBattleCount = parseInt(activeBattles.rows[0].count, 10);
    if (activeBattleCount >= this.maxConcurrentBattles) {
      // Still allow queueing — agents wait until a slot opens
      // But don't auto-create until a slot is available
    }

    // Add to queue
    const result = await this.pool.query(
      `INSERT INTO battle_queue (agent_id, wallet_address, track_url, track_duration_seconds)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [agentId, agent.walletAddress, trackUrl, trackDurationSeconds]
    );

    const entry = this.mapQueueRow(result.rows[0]);

    // Check if we have 2 agents in queue — auto-create battle
    await this.checkAndCreateBattle();

    return entry;
  }

  /**
   * Leave the battle queue
   */
  async leaveQueue(agentId: string): Promise<void> {
    const result = await this.pool.query(
      'DELETE FROM battle_queue WHERE agent_id = $1',
      [agentId]
    );
    if (result.rowCount === 0) {
      throw new Error('Agent is not in the queue');
    }
  }

  /**
   * Get current queue status
   */
  async getQueueStatus(): Promise<{
    entries: QueueEntry[];
    activeBattles: { battleId: number; status: string }[];
    maxConcurrentBattles: number;
  }> {
    const queueResult = await this.pool.query(
      'SELECT * FROM battle_queue ORDER BY joined_at ASC'
    );

    const activeBattleResult = await this.pool.query(
      "SELECT battle_id, status FROM base_battles WHERE status IN ('pending', 'active') ORDER BY created_at DESC"
    );

    return {
      entries: queueResult.rows.map(this.mapQueueRow),
      activeBattles: activeBattleResult.rows.map((row: Record<string, unknown>) => ({
        battleId: row.battle_id as number,
        status: row.status as string,
      })),
      maxConcurrentBattles: this.maxConcurrentBattles,
    };
  }

  /**
   * Check if 2 agents are in queue and auto-create a battle
   */
  async createBattle(agentA: QueueEntry, agentB: QueueEntry): Promise<number> {
    // Calculate battle duration: song1 + song2 + 30s closing window
    const battleDuration =
      agentA.trackDurationSeconds + agentB.trackDurationSeconds + 30;

    // Start time = now + 60s (pre-timer for preparation)
    const startTime = Math.floor(Date.now() / 1000) + 60;

    // Generate next battle ID
    const maxBattleResult = await this.pool.query(
      'SELECT COALESCE(MAX(battle_id), 1000) as max_id FROM base_battles'
    );
    const nextBattleId = parseInt(maxBattleResult.rows[0].max_id, 10) + 1;

    // Payment token (ETH for Base Sepolia)
    const paymentToken = '0x0000000000000000000000000000000000000000';

    try {
      // Initialize battle on-chain
      const txHash = await this.blockchain.initializeBattle({
        battleId: nextBattleId,
        battleDuration,
        startTime,
        artistAWallet: agentA.walletAddress,
        artistBWallet: agentB.walletAddress,
        wavewarzWallet: this.wavewarzWallet,
        paymentToken,
      });

      console.log(`Battle ${nextBattleId} initialized on-chain: ${txHash}`);

      // Store in database
      const startDate = new Date(startTime * 1000);
      const endDate = new Date((startTime + battleDuration) * 1000);

      await this.pool.query(
        `INSERT INTO base_battles (
          battle_id, status, artist_a_agent_id, artist_a_wallet, artist_a_track_url,
          artist_b_agent_id, artist_b_wallet, artist_b_track_url,
          start_time, end_time, payment_token,
          artist_a_pool, artist_b_pool, artist_a_supply, artist_b_supply, winner_decided
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          nextBattleId,
          'pending',
          agentA.agentId,
          agentA.walletAddress,
          agentA.trackUrl,
          agentB.agentId,
          agentB.walletAddress,
          agentB.trackUrl,
          startDate.toISOString(),
          endDate.toISOString(),
          'ETH',
          '0', '0', '0', '0', false,
        ]
      );

      // Mark both agents as in active battle
      await this.agentService.setActiveBattle(agentA.agentId, nextBattleId);
      await this.agentService.setActiveBattle(agentB.agentId, nextBattleId);

      // Clear queue
      await this.pool.query('DELETE FROM battle_queue WHERE agent_id IN ($1, $2)', [
        agentA.agentId,
        agentB.agentId,
      ]);

      console.log(
        `Battle ${nextBattleId} created: ${agentA.agentId} vs ${agentB.agentId}, ` +
        `duration ${battleDuration}s, starts at ${startDate.toISOString()}`
      );

      return nextBattleId;
    } catch (error) {
      console.error('Failed to create battle:', error);
      throw error;
    }
  }

  private async checkAndCreateBattle(): Promise<void> {
    // Check if we have a battle slot available
    const activeBattles = await this.pool.query(
      "SELECT COUNT(*) as count FROM base_battles WHERE status IN ('pending', 'active')"
    );
    const activeBattleCount = parseInt(activeBattles.rows[0].count, 10);
    if (activeBattleCount >= this.maxConcurrentBattles) {
      return; // No slots available
    }

    const queueResult = await this.pool.query(
      'SELECT * FROM battle_queue ORDER BY joined_at ASC LIMIT 2'
    );

    if (queueResult.rows.length < 2) {
      return; // Not enough agents
    }

    const agentA = this.mapQueueRow(queueResult.rows[0]);
    const agentB = this.mapQueueRow(queueResult.rows[1]);

    await this.createBattle(agentA, agentB);
  }

  private mapQueueRow(row: Record<string, unknown>): QueueEntry {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      walletAddress: row.wallet_address as string,
      trackUrl: row.track_url as string,
      trackDurationSeconds: row.track_duration_seconds as number,
      joinedAt: new Date(row.joined_at as string),
    };
  }
}
