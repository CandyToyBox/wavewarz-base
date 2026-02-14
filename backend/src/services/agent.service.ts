/**
 * Agent Service
 * Handles open agent registration and management for BYOW (Bring Your Own Wallet) agents.
 * Any AI agent (OpenClaw, Base agent, etc.) can register and participate.
 */

import { Pool } from 'pg';
import { ethers } from 'ethers';

export interface RegisteredAgent {
  agentId: string;
  walletAddress: string;
  displayName?: string;
  avatarUrl?: string;
  inActiveBattle: boolean;
  currentBattleId: number | null;
  wins: number;
  losses: number;
  totalVolume: string;
  createdAt: Date;
}

// WaveWarz contract ABI for preparing unsigned transactions
const WAVEWARZ_ABI = [
  'function buyShares(uint64 battleId, bool artistA, uint256 amount, uint256 minTokensOut, uint64 deadline) payable returns (uint256)',
  'function sellShares(uint64 battleId, bool artistA, uint256 tokenAmount, uint256 minAmountOut, uint64 deadline) returns (uint256)',
  'function claimShares(uint64 battleId) returns (uint256)',
];

export class AgentService {
  private pool: Pool;
  private contractAddress: string;
  private chainId: number;

  constructor(databaseUrl: string, contractAddress: string, chainId: number = 84532) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
    this.contractAddress = contractAddress;
    this.chainId = chainId; // 84532 = Base Sepolia
  }

  /**
   * Register a new agent (open registration, no admin key required)
   */
  async registerAgent(
    agentId: string,
    walletAddress: string,
    displayName?: string,
    avatarUrl?: string
  ): Promise<RegisteredAgent> {
    // Validate wallet address format
    if (!ethers.isAddress(walletAddress)) {
      throw new Error('Invalid wallet address');
    }

    // Check if agent ID already taken
    const existing = await this.pool.query(
      'SELECT agent_id FROM base_agents WHERE agent_id = $1',
      [agentId]
    );
    if (existing.rows.length > 0) {
      throw new Error('Agent ID already registered');
    }

    // Check if wallet already registered to another agent
    const walletTaken = await this.pool.query(
      'SELECT agent_id FROM base_agents WHERE wallet_address = $1',
      [walletAddress.toLowerCase()]
    );
    if (walletTaken.rows.length > 0) {
      throw new Error('Wallet address already registered to another agent');
    }

    const result = await this.pool.query(
      `INSERT INTO base_agents (agent_id, wallet_address, display_name, avatar_url, wins, losses, total_volume, in_active_battle, current_battle_id)
       VALUES ($1, $2, $3, $4, 0, 0, '0', false, NULL)
       RETURNING *`,
      [agentId, walletAddress.toLowerCase(), displayName || agentId, avatarUrl]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<RegisteredAgent | null> {
    const result = await this.pool.query(
      'SELECT * FROM base_agents WHERE agent_id = $1',
      [agentId]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Get agent by wallet address
   */
  async getAgentByWallet(walletAddress: string): Promise<RegisteredAgent | null> {
    const result = await this.pool.query(
      'SELECT * FROM base_agents WHERE wallet_address = $1',
      [walletAddress.toLowerCase()]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Check if agent is available (registered and not in active battle)
   */
  async isAgentAvailable(agentId: string): Promise<boolean> {
    const agent = await this.getAgent(agentId);
    if (!agent) return false;
    return !agent.inActiveBattle;
  }

  /**
   * Set agent's active battle state
   */
  async setActiveBattle(agentId: string, battleId: number | null): Promise<void> {
    await this.pool.query(
      'UPDATE base_agents SET in_active_battle = $2, current_battle_id = $3, updated_at = NOW() WHERE agent_id = $1',
      [agentId, battleId !== null, battleId]
    );
  }

  /**
   * Prepare unsigned transaction data for buyShares (BYOW agents sign themselves)
   */
  prepareBuyTx(
    battleId: number,
    artistA: boolean,
    amount: string,
    minTokensOut: string
  ): { to: string; value: string; data: string; chainId: number } {
    const deadline = Math.floor(Date.now() / 1000) + 300;
    const iface = new ethers.Interface(WAVEWARZ_ABI);
    const calldata = iface.encodeFunctionData('buyShares', [
      battleId, artistA, BigInt(amount), BigInt(minTokensOut), deadline,
    ]);

    return {
      to: this.contractAddress,
      value: amount,
      data: calldata,
      chainId: this.chainId,
    };
  }

  /**
   * Prepare unsigned transaction data for sellShares
   */
  prepareSellTx(
    battleId: number,
    artistA: boolean,
    tokenAmount: string,
    minAmountOut: string
  ): { to: string; value: string; data: string; chainId: number } {
    const deadline = Math.floor(Date.now() / 1000) + 300;
    const iface = new ethers.Interface(WAVEWARZ_ABI);
    const calldata = iface.encodeFunctionData('sellShares', [
      battleId, artistA, BigInt(tokenAmount), BigInt(minAmountOut), deadline,
    ]);

    return {
      to: this.contractAddress,
      value: '0',
      data: calldata,
      chainId: this.chainId,
    };
  }

  /**
   * Prepare unsigned transaction data for claimShares
   */
  prepareClaimTx(
    battleId: number
  ): { to: string; value: string; data: string; chainId: number } {
    const iface = new ethers.Interface(WAVEWARZ_ABI);
    const calldata = iface.encodeFunctionData('claimShares', [battleId]);

    return {
      to: this.contractAddress,
      value: '0',
      data: calldata,
      chainId: this.chainId,
    };
  }

  private mapRow(row: Record<string, unknown>): RegisteredAgent {
    return {
      agentId: row.agent_id as string,
      walletAddress: row.wallet_address as string,
      displayName: row.display_name as string | undefined,
      avatarUrl: row.avatar_url as string | undefined,
      inActiveBattle: (row.in_active_battle as boolean) || false,
      currentBattleId: row.current_battle_id as number | null,
      wins: row.wins as number,
      losses: row.losses as number,
      totalVolume: row.total_volume as string,
      createdAt: new Date(row.created_at as string),
    };
  }
}
