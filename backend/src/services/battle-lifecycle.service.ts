/**
 * Battle Lifecycle Service
 * Manages the complete battle lifecycle from start to settlement
 * Handles music generation, battle monitoring, settlement, and payouts
 */

import { Pool } from 'pg';
import { BattleService } from './battle.service.js';
import { BlockchainService } from './blockchain.service.js';
import { SunoService } from './suno.service.js';
import { AgentService } from './agent.service.js';

export interface BattlePhase {
  phase: 'initializing' | 'music_generating' | 'ready' | 'active' | 'ending' | 'settled';
  startTime: Date;
  message: string;
}

export interface BattleSettlement {
  battleId: number;
  winnerIsArtistA: boolean;
  artistAPool: string;
  artistBPool: string;
  settledAt: Date;
  artistAEarnings: string;
  artistBEarnings: string;
  traderPayouts: {
    winningSide: string;
    losingSide: string;
  };
}

export interface BattleOutcome {
  battleId: number;
  artistAAgentId: string;
  artistBAgentId: string;
  winner: string;
  winReason: string;
  tradingVolume: string;
  duration: number; // seconds
  settledAt: Date;
}

export class BattleLifecycleService {
  private pool: Pool;
  private battleService: BattleService;
  private blockchain: BlockchainService;
  private suno: SunoService;
  private agentService: AgentService;
  private activeBattles = new Map<number, NodeJS.Timeout>();

  constructor(
    databaseUrl: string,
    battleService: BattleService,
    blockchain: BlockchainService,
    suno: SunoService,
    agentService: AgentService
  ) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
    this.battleService = battleService;
    this.blockchain = blockchain;
    this.suno = suno;
    this.agentService = agentService;
  }

  /**
   * Start a battle with music generation and monitoring
   */
  async startBattle(battleId: number): Promise<BattlePhase> {
    console.log(`🎬 Starting battle ${battleId}`);

    try {
      // Get battle details
      const battle = await this.getBattleDetails(battleId);
      if (!battle) {
        throw new Error(`Battle ${battleId} not found`);
      }

      // Update status to initializing
      await this.updateBattlePhase(battleId, 'initializing');

      // Generate music for both tracks
      console.log(`🎵 Generating music for battle ${battleId}...`);
      const [musicA, musicB] = await Promise.all([
        this.generateMusicForAgent(battle.artist_a_agent_id, battle.artist_a_track_url),
        this.generateMusicForAgent(battle.artist_b_agent_id, battle.artist_b_track_url),
      ]);

      // Store generated tracks
      await Promise.all([
        this.updateBattleTrack(battleId, 'A', musicA),
        this.updateBattleTrack(battleId, 'B', musicB),
      ]);

      console.log(`✅ Music generated for battle ${battleId}`);

      // Update status to ready
      await this.updateBattlePhase(battleId, 'ready');

      // Schedule battle end
      const battleDuration = this.calculateBattleDuration(battle.start_time, battle.end_time);
      this.scheduleBattleEnd(battleId, battleDuration);

      // Mark as active after start time passes
      const timeUntilStart = this.timeUntilStart(battle.start_time);
      if (timeUntilStart > 0) {
        setTimeout(() => {
          this.updateBattlePhase(battleId, 'active').catch(err =>
            console.error(`Failed to mark battle ${battleId} as active:`, err)
          );
        }, timeUntilStart * 1000);
      } else {
        await this.updateBattlePhase(battleId, 'active');
      }

      return {
        phase: 'ready',
        startTime: new Date(),
        message: `Battle ${battleId} ready to begin. Music generated and monitoring started.`,
      };
    } catch (error) {
      console.error(`Failed to start battle ${battleId}:`, error);
      await this.updateBattlePhase(battleId, 'failed');
      throw error;
    }
  }

  /**
   * Manually end a battle and trigger settlement
   */
  async endBattle(battleId: number): Promise<BattleSettlement> {
    console.log(`🏁 Ending battle ${battleId}`);

    try {
      // Cancel scheduled end if exists
      const scheduled = this.activeBattles.get(battleId);
      if (scheduled) {
        clearTimeout(scheduled);
        this.activeBattles.delete(battleId);
      }

      // Get final state from blockchain
      const onChainState = await this.blockchain.getBattle(battleId);
      if (!onChainState) {
        throw new Error(`Unable to fetch battle state from blockchain for ${battleId}`);
      }

      // Update status to ending
      await this.updateBattlePhase(battleId, 'ending');

      // Get pool amounts (use onChainState values or database)
      const artistAPool = onChainState.artistAPool?.toString() || '0';
      const artistBPool = onChainState.artistBPool?.toString() || '0';

      // Determine winner and settle
      const settlement = await this.settleBattle(
        battleId,
        onChainState.winnerIsArtistA || false,
        artistAPool,
        artistBPool
      );

      // Record outcome
      const battle = await this.getBattleDetails(battleId);
      if (battle) {
        await this.recordBattleOutcome(
          battleId,
          battle.artist_a_agent_id,
          battle.artist_b_agent_id,
          onChainState.winnerIsArtistA ? battle.artist_a_agent_id : battle.artist_b_agent_id,
          'On-chain settlement'
        );
      }

      // Mark as settled
      await this.updateBattlePhase(battleId, 'settled');
      console.log(`✅ Battle ${battleId} settled`);

      return settlement;
    } catch (error) {
      console.error(`Failed to end battle ${battleId}:`, error);
      throw error;
    }
  }

  /**
   * Get current battle phase
   */
  async getBattlePhase(battleId: number): Promise<string> {
    try {
      const result = await this.pool.query(
        'SELECT status FROM base_battles WHERE battle_id = $1',
        [battleId]
      );
      return result.rows[0]?.status || 'unknown';
    } catch (error) {
      console.error(`Failed to get battle phase for ${battleId}:`, error);
      return 'error';
    }
  }

  /**
   * Get battle progress (time remaining, pools, etc)
   */
  async getBattleProgress(battleId: number): Promise<any> {
    try {
      const result = await this.pool.query(
        `SELECT
          battle_id,
          artist_a_agent_id,
          artist_b_agent_id,
          start_time,
          end_time,
          artist_a_pool,
          artist_b_pool,
          artist_a_supply,
          artist_b_supply,
          status,
          winner_decided
        FROM base_battles
        WHERE battle_id = $1`,
        [battleId]
      );

      if (result.rows.length === 0) {
        throw new Error(`Battle ${battleId} not found`);
      }

      const battle = result.rows[0];
      const now = new Date();
      const endTime = new Date(battle.end_time);
      const timeRemainingSeconds = Math.max(0, (endTime.getTime() - now.getTime()) / 1000);

      return {
        battleId,
        status: battle.status,
        timeRemainingSeconds: Math.round(timeRemainingSeconds),
        artistAPool: battle.artist_a_pool,
        artistBPool: battle.artist_b_pool,
        artistASupply: battle.artist_a_supply,
        artistBSupply: battle.artist_b_supply,
        winnerDecided: battle.winner_decided,
        startTime: battle.start_time,
        endTime: battle.end_time,
      };
    } catch (error) {
      console.error(`Failed to get battle progress for ${battleId}:`, error);
      throw error;
    }
  }

  /**
   * Schedule automatic battle end when timer expires
   */
  private scheduleBattleEnd(battleId: number, durationSeconds: number): void {
    // Add 5 seconds buffer for blockchain finalization
    const timeoutMs = (durationSeconds + 5) * 1000;

    const timeout = setTimeout(async () => {
      try {
        console.log(`⏰ Battle ${battleId} timer expired, settling...`);
        await this.endBattle(battleId);
      } catch (error) {
        console.error(`Failed to auto-end battle ${battleId}:`, error);
        // Retry in 10 seconds
        this.scheduleBattleEnd(battleId, 10);
      }
    }, timeoutMs);

    this.activeBattles.set(battleId, timeout);
  }

  /**
   * Generate music for an agent's track
   */
  private async generateMusicForAgent(agentId: string, trackUrl: string): Promise<any> {
    try {
      // If it's a Suno track, use Suno API
      if (trackUrl.includes('suno') || trackUrl.includes('audius')) {
        // For real implementation, call SUNO API to generate original music
        // For now, return mock response
        return {
          trackId: `track-${agentId}-${Date.now()}`,
          duration: Math.random() * 180 + 60, // 1-3 minutes
          generatedAt: new Date(),
          url: trackUrl, // Would be generated track URL from SUNO
        };
      }

      return {
        trackId: `track-${agentId}-${Date.now()}`,
        duration: 180,
        generatedAt: new Date(),
        url: trackUrl,
      };
    } catch (error) {
      console.error(`Failed to generate music for ${agentId}:`, error);
      throw new Error(`Music generation failed for agent ${agentId}`);
    }
  }

  /**
   * Settle a battle and distribute payouts
   */
  private async settleBattle(
    battleId: number,
    winnerIsArtistA: boolean,
    artistAPool: string,
    artistBPool: string
  ): Promise<BattleSettlement> {
    try {
      const artistAPoolNum = parseFloat(artistAPool);
      const artistBPoolNum = parseFloat(artistBPool);
      const winningPool = winnerIsArtistA ? artistAPoolNum : artistBPoolNum;
      const losingPool = winnerIsArtistA ? artistBPoolNum : artistAPoolNum;

      // Calculate payouts
      const artistAEarnings = winnerIsArtistA
        ? (artistAPoolNum * 0.01 + losingPool * 0.05).toString() // 1% trading fee + 5% settlement bonus
        : (artistAPoolNum * 0.01 + losingPool * 0.02).toString(); // 1% trading fee + 2% consolation

      const artistBEarnings = !winnerIsArtistA
        ? (artistBPoolNum * 0.01 + losingPool * 0.05).toString()
        : (artistBPoolNum * 0.01 + losingPool * 0.02).toString();

      // Trader payouts: 50% to losing, 40% bonus to winning, 3% platform, 5% artists
      const traderPayouts = {
        winningSide: (winningPool + losingPool * 0.40).toString(),
        losingSide: (losingPool * 0.50).toString(),
      };

      // Update battle status
      await this.pool.query(
        `UPDATE base_battles
         SET winner_decided = true, winner_artist_a = $2, settled_at = NOW()
         WHERE battle_id = $1`,
        [battleId, winnerIsArtistA]
      );

      // Log settlement
      await this.pool.query(
        `INSERT INTO battle_settlements (battle_id, winner_is_artist_a, artist_a_pool, artist_b_pool, artist_a_earnings, artist_b_earnings)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [battleId, winnerIsArtistA, artistAPool, artistBPool, artistAEarnings, artistBEarnings]
      );

      return {
        battleId,
        winnerIsArtistA,
        artistAPool,
        artistBPool,
        settledAt: new Date(),
        artistAEarnings,
        artistBEarnings,
        traderPayouts,
      };
    } catch (error) {
      console.error(`Failed to settle battle ${battleId}:`, error);
      throw error;
    }
  }

  /**
   * Record battle outcome for analytics
   */
  private async recordBattleOutcome(
    battleId: number,
    artistAId: string,
    artistBId: string,
    winnerId: string,
    reason: string
  ): Promise<void> {
    try {
      const battle = await this.getBattleDetails(battleId);
      if (!battle) return;

      const duration = this.calculateBattleDuration(battle.start_time, battle.end_time);
      const totalVolume = (parseFloat(battle.artist_a_pool) + parseFloat(battle.artist_b_pool)).toString();

      await this.pool.query(
        `INSERT INTO battle_outcomes (battle_id, artist_a_agent_id, artist_b_agent_id, winner_agent_id, win_reason, trading_volume, duration_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [battleId, artistAId, artistBId, winnerId, reason, totalVolume, duration]
      );

      // Update agent stats
      await Promise.all([
        this.updateAgentStats(artistAId, winnerId === artistAId),
        this.updateAgentStats(artistBId, winnerId === artistBId),
      ]);
    } catch (error) {
      console.error(`Failed to record battle outcome for ${battleId}:`, error);
    }
  }

  /**
   * Update agent statistics after battle
   */
  private async updateAgentStats(agentId: string, won: boolean): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE base_agents
         SET ${won ? 'wins = wins + 1' : 'losses = losses + 1'}
         WHERE agent_id = $1`,
        [agentId]
      );
    } catch (error) {
      console.error(`Failed to update stats for ${agentId}:`, error);
    }
  }

  /**
   * Get battle details
   */
  private async getBattleDetails(battleId: number): Promise<any> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM base_battles WHERE battle_id = $1`,
        [battleId]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error(`Failed to get battle details for ${battleId}:`, error);
      return null;
    }
  }

  /**
   * Get pool amounts from blockchain
   */
  private async getBattlePoolAmounts(battleId: number): Promise<{ artistAPool: string; artistBPool: string }> {
    try {
      const state = await this.blockchain.getBattle(battleId);
      return {
        artistAPool: state?.artistAPool?.toString() || '0',
        artistBPool: state?.artistBPool?.toString() || '0',
      };
    } catch (error) {
      console.error(`Failed to get pool amounts for ${battleId}:`, error);
      return { artistAPool: '0', artistBPool: '0' };
    }
  }

  /**
   * Calculate battle duration in seconds
   */
  private calculateBattleDuration(startTime: Date | string, endTime: Date | string): number {
    const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
    const end = typeof endTime === 'string' ? new Date(endTime) : endTime;
    return Math.round((end.getTime() - start.getTime()) / 1000);
  }

  /**
   * Calculate seconds until battle starts
   */
  private timeUntilStart(startTime: Date | string): number {
    const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
    return Math.max(0, (start.getTime() - Date.now()) / 1000);
  }

  /**
   * Update battle phase
   */
  private async updateBattlePhase(battleId: number, phase: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE base_battles SET status = $2 WHERE battle_id = $1`,
        [battleId, phase]
      );
    } catch (error) {
      console.error(`Failed to update battle phase for ${battleId}:`, error);
    }
  }

  /**
   * Update battle track information
   */
  private async updateBattleTrack(battleId: number, side: 'A' | 'B', musicData: any): Promise<void> {
    try {
      const columnPrefix = side === 'A' ? 'artist_a' : 'artist_b';
      await this.pool.query(
        `UPDATE base_battles
         SET ${columnPrefix}_track_generated_at = NOW(),
             ${columnPrefix}_track_id = $2
         WHERE battle_id = $1`,
        [battleId, musicData.trackId]
      );
    } catch (error) {
      console.error(`Failed to update track for battle ${battleId}:`, error);
    }
  }

  /**
   * Cleanup: Close database connection
   */
  async close(): Promise<void> {
    // Clear all scheduled timeouts
    for (const timeout of this.activeBattles.values()) {
      clearTimeout(timeout);
    }
    this.activeBattles.clear();

    await this.pool.end();
  }
}
