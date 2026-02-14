import { Pool } from 'pg';
import type {
  Battle,
  CreateBattleInput,
  Trade,
  TradeSide,
  TradeType,
  Agent,
  BattleStatus,
} from '../types/index.js';
import { BlockchainService } from './blockchain.service.js';
import { SunoService } from './suno.service.js';

export class BattleService {
  private pool: Pool;
  private blockchain: BlockchainService;
  private suno: SunoService;
  private wavewarzWallet: string;

  constructor(
    _supabaseUrl: string,
    _supabaseKey: string,
    blockchain: BlockchainService,
    suno: SunoService,
    wavewarzWallet: string
  ) {
    // Use direct pg connection instead of Supabase client (works around legacy API key issue)
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    this.blockchain = blockchain;
    this.suno = suno;
    this.wavewarzWallet = wavewarzWallet;
  }

  /**
   * Create a new battle
   */
  async createBattle(input: CreateBattleInput): Promise<Battle> {
    // Verify both agents exist in DB
    const [agentA, agentB] = await Promise.all([
      this.getAgent(input.artistAAgentId),
      this.getAgent(input.artistBAgentId),
    ]);

    if (!agentA || !agentB) {
      throw new Error('One or both agents are not registered');
    }

    // Verify wallet ownership matches DB records
    if (agentA.walletAddress.toLowerCase() !== input.artistAWallet.toLowerCase()) {
      throw new Error('Artist A wallet does not match registered wallet');
    }
    if (agentB.walletAddress.toLowerCase() !== input.artistBWallet.toLowerCase()) {
      throw new Error('Artist B wallet does not match registered wallet');
    }

    // Calculate timestamps
    const startTime = Math.floor(new Date(input.startTime).getTime() / 1000);
    const paymentToken = input.paymentToken === 'ETH'
      ? '0x0000000000000000000000000000000000000000'
      : process.env.USDC_CONTRACT_ADDRESS!;

    // Initialize battle on-chain
    const txHash = await this.blockchain.initializeBattle({
      battleId: input.battleId,
      battleDuration: input.battleDuration,
      startTime,
      artistAWallet: input.artistAWallet,
      artistBWallet: input.artistBWallet,
      wavewarzWallet: this.wavewarzWallet,
      paymentToken,
    });

    console.log('Battle initialized on-chain:', txHash);

    // Store in database
    const battle: Omit<Battle, 'id'> = {
      battleId: input.battleId,
      status: 'pending' as BattleStatus,
      createdAt: new Date(),
      artistAAgentId: input.artistAAgentId,
      artistAWallet: input.artistAWallet,
      artistBAgentId: input.artistBAgentId,
      artistBWallet: input.artistBWallet,
      startTime: new Date(input.startTime),
      endTime: new Date(new Date(input.startTime).getTime() + input.battleDuration * 1000),
      paymentToken: input.paymentToken,
      artistAPool: '0',
      artistBPool: '0',
      artistASupply: '0',
      artistBSupply: '0',
      winnerDecided: false,
    };

    // Store in database using pg
    const insertQuery = `
      INSERT INTO base_battles (
        battle_id, status, artist_a_agent_id, artist_a_wallet,
        artist_b_agent_id, artist_b_wallet, start_time, end_time,
        payment_token, artist_a_pool, artist_b_pool,
        artist_a_supply, artist_b_supply, winner_decided
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const result = await this.pool.query(insertQuery, [
      battle.battleId,
      battle.status,
      battle.artistAAgentId,
      battle.artistAWallet,
      battle.artistBAgentId,
      battle.artistBWallet,
      battle.startTime.toISOString(),
      battle.endTime.toISOString(),
      battle.paymentToken,
      battle.artistAPool,
      battle.artistBPool,
      battle.artistASupply,
      battle.artistBSupply,
      battle.winnerDecided,
    ]);

    if (result.rows.length === 0) {
      throw new Error('Failed to store battle');
    }

    // Update agent stats
    await this.ensureAgentExists(input.artistAAgentId, input.artistAWallet, agentA?.displayName);
    await this.ensureAgentExists(input.artistBAgentId, input.artistBWallet, agentB?.displayName);

    return this.mapDbToBattle(result.rows[0]);
  }

  /**
   * Generate music tracks for both artists in a battle
   */
  async generateBattleMusic(battleId: number): Promise<{
    artistATrack: string;
    artistBTrack: string;
  }> {
    const battle = await this.getBattle(battleId);
    if (!battle) {
      throw new Error('Battle not found');
    }

    // Get agent profiles for names
    const [agentA, agentB] = await Promise.all([
      this.getAgent(battle.artistAAgentId),
      this.getAgent(battle.artistBAgentId),
    ]);

    // Generate prompts and tracks in parallel
    const [trackA, trackB] = await Promise.all([
      this.suno.generateTrackWithRetry({
        prompt: SunoService.generateBattlePrompt(
          agentA?.displayName || 'Artist A',
          'hip-hop',
          'AI Battle Champion'
        ),
        style: 'hip-hop',
        duration: 90,
      }),
      this.suno.generateTrackWithRetry({
        prompt: SunoService.generateBattlePrompt(
          agentB?.displayName || 'Artist B',
          'hip-hop',
          'AI Battle Contender'
        ),
        style: 'hip-hop',
        duration: 90,
      }),
    ]);

    // Update battle with track URLs
    await this.pool.query(
      'UPDATE base_battles SET artist_a_track_url = $1, artist_b_track_url = $2 WHERE battle_id = $3',
      [trackA.trackUrl, trackB.trackUrl, battleId]
    );

    return {
      artistATrack: trackA.trackUrl,
      artistBTrack: trackB.trackUrl,
    };
  }

  /**
   * Get battle by ID
   */
  async getBattle(battleId: number): Promise<Battle | null> {
    const result = await this.pool.query(
      'SELECT * FROM base_battles WHERE battle_id = $1',
      [battleId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDbToBattle(result.rows[0]);
  }

  /**
   * List battles with optional filters
   */
  async listBattles(params: {
    status?: BattleStatus;
    page?: number;
    pageSize?: number;
  }): Promise<{ battles: Battle[]; total: number }> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let whereClause = '';
    const queryParams: unknown[] = [];

    if (params.status) {
      whereClause = 'WHERE status = $1';
      queryParams.push(params.status);
    }

    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM base_battles ${whereClause}`,
      queryParams
    );

    const result = await this.pool.query(
      `SELECT * FROM base_battles ${whereClause} ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
      [...queryParams, pageSize, offset]
    );

    return {
      battles: result.rows.map(this.mapDbToBattle),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  /**
   * Sync battle state from blockchain
   */
  async syncBattleFromChain(battleId: number): Promise<Battle | null> {
    const onChainBattle = await this.blockchain.getBattle(battleId);
    if (!onChainBattle) {
      return null;
    }

    // Determine status
    const now = Math.floor(Date.now() / 1000);
    let status: BattleStatus = 'pending';
    if (onChainBattle.winnerDecided) {
      status = 'settled';
    } else if (!onChainBattle.isActive && Number(onChainBattle.endTime) < now) {
      status = 'completed';
    } else if (onChainBattle.isActive) {
      status = 'active';
    }

    // Update database
    const result = await this.pool.query(
      `UPDATE base_battles SET
        status = $1,
        artist_a_pool = $2,
        artist_b_pool = $3,
        artist_a_supply = $4,
        artist_b_supply = $5,
        winner_decided = $6,
        winner_artist_a = $7
      WHERE battle_id = $8
      RETURNING *`,
      [
        status,
        onChainBattle.artistAPool.toString(),
        onChainBattle.artistBPool.toString(),
        onChainBattle.artistASupply.toString(),
        onChainBattle.artistBSupply.toString(),
        onChainBattle.winnerDecided,
        onChainBattle.winnerIsArtistA,
        battleId,
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to sync battle');
    }

    return this.mapDbToBattle(result.rows[0]);
  }

  /**
   * End a battle (admin only)
   */
  async endBattle(battleId: number, winnerIsArtistA: boolean): Promise<string> {
    // End on-chain
    const txHash = await this.blockchain.endBattle(battleId, winnerIsArtistA);

    // Sync state
    await this.syncBattleFromChain(battleId);

    // Update agent stats
    const battle = await this.getBattle(battleId);
    if (battle) {
      const winnerId = winnerIsArtistA ? battle.artistAAgentId : battle.artistBAgentId;
      const loserId = winnerIsArtistA ? battle.artistBAgentId : battle.artistAAgentId;

      await this.pool.query('UPDATE base_agents SET wins = wins + 1 WHERE agent_id = $1', [winnerId]);
      await this.pool.query('UPDATE base_agents SET losses = losses + 1 WHERE agent_id = $1', [loserId]);
    }

    return txHash;
  }

  /**
   * Record a trade event
   */
  async recordTrade(trade: Omit<Trade, 'id'>): Promise<void> {
    await this.pool.query(
      `INSERT INTO base_trades (
        battle_id, tx_hash, trader_wallet, artist_side, trade_type,
        token_amount, payment_amount, artist_fee, platform_fee, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        trade.battleId,
        trade.txHash,
        trade.traderWallet,
        trade.artistSide,
        trade.tradeType,
        trade.tokenAmount,
        trade.paymentAmount,
        trade.artistFee,
        trade.platformFee,
        trade.timestamp.toISOString(),
      ]
    );
  }

  /**
   * Get trades for a battle
   */
  async getBattleTrades(battleId: number): Promise<Trade[]> {
    const result = await this.pool.query(
      'SELECT * FROM base_trades WHERE battle_id = $1 ORDER BY timestamp ASC',
      [battleId]
    );

    const data = result.rows;

    return (data || []).map(row => ({
      id: row.id,
      battleId: row.battle_id,
      txHash: row.tx_hash,
      traderWallet: row.trader_wallet,
      artistSide: row.artist_side as TradeSide,
      tradeType: row.trade_type as TradeType,
      tokenAmount: row.token_amount,
      paymentAmount: row.payment_amount,
      artistFee: row.artist_fee,
      platformFee: row.platform_fee,
      timestamp: new Date(row.timestamp),
    }));
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<Agent | null> {
    const result = await this.pool.query(
      'SELECT * FROM base_agents WHERE agent_id = $1',
      [agentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDbToAgent(result.rows[0]);
  }

  /**
   * Get agent battles
   */
  async getAgentBattles(agentId: string): Promise<Battle[]> {
    const result = await this.pool.query(
      'SELECT * FROM base_battles WHERE artist_a_agent_id = $1 OR artist_b_agent_id = $1 ORDER BY created_at DESC',
      [agentId]
    );

    return result.rows.map(this.mapDbToBattle);
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(limit: number = 20): Promise<Agent[]> {
    const result = await this.pool.query(
      'SELECT * FROM base_agents ORDER BY wins DESC LIMIT $1',
      [limit]
    );

    return result.rows.map(this.mapDbToAgent);
  }

  /**
   * Get a trader's token balance for a battle
   */
  async getTraderTokenBalance(
    battleId: number,
    traderAddress: string
  ): Promise<{ artistABalance: string; artistBBalance: string }> {
    const [artistABalance, artistBBalance] = await Promise.all([
      this.blockchain.getTraderTokenBalance(battleId, traderAddress, true),
      this.blockchain.getTraderTokenBalance(battleId, traderAddress, false),
    ]);

    return {
      artistABalance: artistABalance.toString(),
      artistBBalance: artistBBalance.toString(),
    };
  }

  // ============ Private Helpers ============

  private async ensureAgentExists(
    agentId: string,
    wallet: string,
    displayName?: string
  ): Promise<void> {
    const result = await this.pool.query(
      'SELECT agent_id FROM base_agents WHERE agent_id = $1',
      [agentId]
    );

    if (result.rows.length === 0) {
      await this.pool.query(
        `INSERT INTO base_agents (agent_id, wallet_address, display_name, wins, losses, total_volume)
         VALUES ($1, $2, $3, 0, 0, '0')`,
        [agentId, wallet, displayName]
      );
    }
  }

  private mapDbToBattle(row: Record<string, unknown>): Battle {
    return {
      id: row.id as string,
      battleId: row.battle_id as number,
      status: row.status as BattleStatus,
      createdAt: new Date(row.created_at as string),
      artistAAgentId: row.artist_a_agent_id as string,
      artistAWallet: row.artist_a_wallet as string,
      artistATrackUrl: row.artist_a_track_url as string | undefined,
      artistBAgentId: row.artist_b_agent_id as string,
      artistBWallet: row.artist_b_wallet as string,
      artistBTrackUrl: row.artist_b_track_url as string | undefined,
      startTime: new Date(row.start_time as string),
      endTime: new Date(row.end_time as string),
      paymentToken: row.payment_token as 'ETH' | 'USDC',
      artistAPool: row.artist_a_pool as string,
      artistBPool: row.artist_b_pool as string,
      artistASupply: row.artist_a_supply as string,
      artistBSupply: row.artist_b_supply as string,
      winnerDecided: row.winner_decided as boolean,
      winnerIsArtistA: row.winner_artist_a as boolean | undefined,
    };
  }

  private mapDbToAgent(row: Record<string, unknown>): Agent {
    return {
      agentId: row.agent_id as string,
      walletAddress: row.wallet_address as string,
      displayName: row.display_name as string | undefined,
      avatarUrl: row.avatar_url as string | undefined,
      isVerified: (row.is_verified as boolean) || false,
      wins: row.wins as number,
      losses: row.losses as number,
      totalVolume: row.total_volume as string,
      createdAt: new Date(row.created_at as string),
    };
  }
}
