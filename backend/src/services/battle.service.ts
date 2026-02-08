import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
import { MoltbookService } from './moltbook.service.js';
import { SunoService } from './suno.service.js';

export class BattleService {
  private supabase: SupabaseClient;
  private blockchain: BlockchainService;
  private moltbook: MoltbookService;
  private suno: SunoService;
  private wavewarzWallet: string;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    blockchain: BlockchainService,
    moltbook: MoltbookService,
    suno: SunoService,
    wavewarzWallet: string
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.blockchain = blockchain;
    this.moltbook = moltbook;
    this.suno = suno;
    this.wavewarzWallet = wavewarzWallet;
  }

  /**
   * Create a new battle
   */
  async createBattle(input: CreateBattleInput): Promise<Battle> {
    // Verify both agents on Moltbook
    const [agentAValid, agentBValid] = await Promise.all([
      this.moltbook.isValidMoltbookAgent(input.artistAAgentId),
      this.moltbook.isValidMoltbookAgent(input.artistBAgentId),
    ]);

    if (!agentAValid || !agentBValid) {
      throw new Error('One or both agents are not valid Moltbook agents');
    }

    // Verify wallet ownership
    const [walletAValid, walletBValid] = await Promise.all([
      this.moltbook.verifyAgentWallet(input.artistAAgentId, input.artistAWallet),
      this.moltbook.verifyAgentWallet(input.artistBAgentId, input.artistBWallet),
    ]);

    if (!walletAValid || !walletBValid) {
      throw new Error('One or both agents do not own their claimed wallets');
    }

    // Get agent profiles
    const [agentA, agentB] = await Promise.all([
      this.moltbook.getAgentProfile(input.artistAAgentId),
      this.moltbook.getAgentProfile(input.artistBAgentId),
    ]);

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

    const { data, error } = await this.supabase
      .from('base_battles')
      .insert({
        battle_id: battle.battleId,
        status: battle.status,
        artist_a_agent_id: battle.artistAAgentId,
        artist_a_wallet: battle.artistAWallet,
        artist_b_agent_id: battle.artistBAgentId,
        artist_b_wallet: battle.artistBWallet,
        start_time: battle.startTime.toISOString(),
        end_time: battle.endTime.toISOString(),
        payment_token: battle.paymentToken,
        artist_a_pool: battle.artistAPool,
        artist_b_pool: battle.artistBPool,
        artist_a_supply: battle.artistASupply,
        artist_b_supply: battle.artistBSupply,
        winner_decided: battle.winnerDecided,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to store battle: ${error.message}`);
    }

    // Update agent stats
    await this.ensureAgentExists(input.artistAAgentId, input.artistAWallet, agentA?.displayName);
    await this.ensureAgentExists(input.artistBAgentId, input.artistBWallet, agentB?.displayName);

    return this.mapDbToBattle(data);
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
      this.moltbook.getAgentProfile(battle.artistAAgentId),
      this.moltbook.getAgentProfile(battle.artistBAgentId),
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
    await this.supabase
      .from('base_battles')
      .update({
        artist_a_track_url: trackA.trackUrl,
        artist_b_track_url: trackB.trackUrl,
      })
      .eq('battle_id', battleId);

    return {
      artistATrack: trackA.trackUrl,
      artistBTrack: trackB.trackUrl,
    };
  }

  /**
   * Get battle by ID
   */
  async getBattle(battleId: number): Promise<Battle | null> {
    const { data, error } = await this.supabase
      .from('base_battles')
      .select('*')
      .eq('battle_id', battleId)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapDbToBattle(data);
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

    let query = this.supabase
      .from('base_battles')
      .select('*', { count: 'exact' });

    if (params.status) {
      query = query.eq('status', params.status);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to list battles: ${error.message}`);
    }

    return {
      battles: (data || []).map(this.mapDbToBattle),
      total: count || 0,
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
    const { data, error } = await this.supabase
      .from('base_battles')
      .update({
        status,
        artist_a_pool: onChainBattle.artistAPool.toString(),
        artist_b_pool: onChainBattle.artistBPool.toString(),
        artist_a_supply: onChainBattle.artistASupply.toString(),
        artist_b_supply: onChainBattle.artistBSupply.toString(),
        winner_decided: onChainBattle.winnerDecided,
        winner_artist_a: onChainBattle.winnerIsArtistA,
      })
      .eq('battle_id', battleId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to sync battle: ${error.message}`);
    }

    return this.mapDbToBattle(data);
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

      await this.supabase.rpc('increment_agent_wins', { agent_id: winnerId });
      await this.supabase.rpc('increment_agent_losses', { agent_id: loserId });

      // Post results to Moltbook
      await this.moltbook.postAnnouncement(
        `Battle #${battleId} has ended! ${winnerIsArtistA ? battle.artistAAgentId : battle.artistBAgentId} wins!`,
        { battleId, type: 'battle_end' }
      );
    }

    return txHash;
  }

  /**
   * Record a trade event
   */
  async recordTrade(trade: Omit<Trade, 'id'>): Promise<void> {
    await this.supabase.from('base_trades').insert({
      battle_id: trade.battleId,
      tx_hash: trade.txHash,
      trader_wallet: trade.traderWallet,
      artist_side: trade.artistSide,
      trade_type: trade.tradeType,
      token_amount: trade.tokenAmount,
      payment_amount: trade.paymentAmount,
      artist_fee: trade.artistFee,
      platform_fee: trade.platformFee,
      timestamp: trade.timestamp.toISOString(),
    });
  }

  /**
   * Get trades for a battle
   */
  async getBattleTrades(battleId: number): Promise<Trade[]> {
    const { data, error } = await this.supabase
      .from('base_trades')
      .select('*')
      .eq('battle_id', battleId)
      .order('timestamp', { ascending: true });

    if (error) {
      throw new Error(`Failed to get trades: ${error.message}`);
    }

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
    const { data, error } = await this.supabase
      .from('base_agents')
      .select('*')
      .eq('agent_id', agentId)
      .single();

    if (error || !data) {
      return null;
    }

    return this.mapDbToAgent(data);
  }

  /**
   * Get agent battles
   */
  async getAgentBattles(agentId: string): Promise<Battle[]> {
    const { data, error } = await this.supabase
      .from('base_battles')
      .select('*')
      .or(`artist_a_agent_id.eq.${agentId},artist_b_agent_id.eq.${agentId}`)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get agent battles: ${error.message}`);
    }

    return (data || []).map(this.mapDbToBattle);
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(limit: number = 20): Promise<Agent[]> {
    const { data, error } = await this.supabase
      .from('base_agents')
      .select('*')
      .order('wins', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get leaderboard: ${error.message}`);
    }

    return (data || []).map(this.mapDbToAgent);
  }

  // ============ Private Helpers ============

  private async ensureAgentExists(
    agentId: string,
    wallet: string,
    displayName?: string
  ): Promise<void> {
    const { data } = await this.supabase
      .from('base_agents')
      .select('agent_id')
      .eq('agent_id', agentId)
      .single();

    if (!data) {
      await this.supabase.from('base_agents').insert({
        agent_id: agentId,
        wallet_address: wallet,
        display_name: displayName,
        moltbook_verified: true,
        wins: 0,
        losses: 0,
        total_volume: '0',
      });
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
      moltbookVerified: row.moltbook_verified as boolean,
      wins: row.wins as number,
      losses: row.losses as number,
      totalVolume: row.total_volume as string,
      createdAt: new Date(row.created_at as string),
    };
  }
}
