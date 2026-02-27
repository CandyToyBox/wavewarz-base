/**
 * Trade Executor
 * Handles signing and executing trades on-chain via agent wallets.
 * Uses direct ethers.js signing with private keys (env vars) — no CDP MPC dependency.
 *
 * Required env vars for each agent:
 *   WAVEX_PRIVATE_KEY  — private key for wavex-001
 *   NOVA_PRIVATE_KEY   — private key for nova-001
 *   LIL_LOB_PRIVATE_KEY — private key for lil-lob-001
 */

import { Wallet, JsonRpcProvider, ethers } from 'ethers';
import { Pool } from 'pg';
import type { RegisteredAgent } from './agent.service.js';
import { BlockchainService } from './blockchain.service.js';
import { CdpService } from './cdp.service.js';

export interface ExecutedTrade {
  battleId: number;
  agentId: string;
  txHash: string;
  tradeType: 'buy' | 'sell';
  targetSide: 'A' | 'B';
  amount: string;
  timestamp: Date;
}

export interface TradeExecutionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  details?: string;
}

// Map agentId → env var name for private key
const AGENT_KEY_ENV: Record<string, string> = {
  'wavex-001':   'WAVEX_PRIVATE_KEY',
  'nova-001':    'NOVA_PRIVATE_KEY',
  'lil-lob-001': 'LIL_LOB_PRIVATE_KEY',
};

export class TradeExecutor {
  private pool: Pool;
  private blockchain: BlockchainService;
  private cdp: CdpService;
  private rpcUrl: string;
  private contractAddress: string;
  private provider: JsonRpcProvider;

  // Cache of ethers.Wallet instances keyed by agentId
  private wallets: Map<string, Wallet> = new Map();

  constructor(
    databaseUrl: string,
    blockchain: BlockchainService,
    cdp: CdpService,
    rpcUrl: string,
    contractAddress: string
  ) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
    this.blockchain = blockchain;
    this.cdp = cdp;
    this.rpcUrl = rpcUrl;
    this.contractAddress = contractAddress;
    this.provider = new JsonRpcProvider(rpcUrl);

    // Pre-load wallets from env vars
    for (const [agentId, envKey] of Object.entries(AGENT_KEY_ENV)) {
      const pk = process.env[envKey];
      if (pk) {
        try {
          const wallet = new Wallet(pk, this.provider);
          this.wallets.set(agentId, wallet);
          console.log(`✓ Loaded signing wallet for ${agentId}: ${wallet.address}`);
        } catch (e) {
          console.error(`✗ Invalid private key for ${agentId} (${envKey}):`, e);
        }
      } else {
        console.warn(`⚠️  No private key for ${agentId} — set ${envKey} env var to enable trading`);
      }
    }
  }

  /**
   * Get the ethers.Wallet for an agent, or null if not configured.
   */
  private getWallet(agentId: string): Wallet | null {
    return this.wallets.get(agentId) ?? null;
  }

  /**
   * Execute a buy trade (sends ETH with the transaction)
   */
  async executeBuyTrade(
    battleId: number,
    agentId: string,
    amountInWei: bigint,
    targetSide: 'A' | 'B'
  ): Promise<TradeExecutionResult> {
    try {
      const wallet = this.getWallet(agentId);
      if (!wallet) {
        return {
          success: false,
          error: `No signing wallet configured for ${agentId}. Set ${AGENT_KEY_ENV[agentId] ?? 'AGENT_PRIVATE_KEY'} env var.`,
        };
      }

      const txHash = await this.executeDirectBuy(wallet, battleId, amountInWei, targetSide);
      await this.logTrade(battleId, agentId, 'buy', targetSide, amountInWei.toString(), txHash);

      return { success: true, txHash };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg, details: 'Buy trade execution failed' };
    }
  }

  /**
   * Execute a sell trade
   */
  async executeSellTrade(
    battleId: number,
    agentId: string,
    tokenAmount: bigint,
    targetSide: 'A' | 'B'
  ): Promise<TradeExecutionResult> {
    try {
      const wallet = this.getWallet(agentId);
      if (!wallet) {
        return {
          success: false,
          error: `No signing wallet configured for ${agentId}. Set ${AGENT_KEY_ENV[agentId] ?? 'AGENT_PRIVATE_KEY'} env var.`,
        };
      }

      const txHash = await this.executeDirectSell(wallet, battleId, tokenAmount, targetSide);
      await this.logTrade(battleId, agentId, 'sell', targetSide, tokenAmount.toString(), txHash);

      return { success: true, txHash };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMsg, details: 'Sell trade execution failed' };
    }
  }

  /**
   * Sign and broadcast a buyShares transaction directly via ethers.js
   */
  private async executeDirectBuy(
    wallet: Wallet,
    battleId: number,
    amountInWei: bigint,
    targetSide: 'A' | 'B'
  ): Promise<string> {
    const deadline = Math.floor(Date.now() / 1000) + 300;
    const iface = new ethers.Interface([
      'function buyShares(uint64 battleId, bool artistA, uint256 amount, uint256 minTokensOut, uint64 deadline) payable returns (uint256)',
    ]);
    const data = iface.encodeFunctionData('buyShares', [
      battleId,
      targetSide === 'A',
      amountInWei,
      0n,
      deadline,
    ]);

    const tx = await wallet.sendTransaction({
      to: this.contractAddress,
      value: amountInWei,
      data,
    });

    console.log(`📤 Buy tx sent: ${tx.hash} (battleId=${battleId}, side=${targetSide}, amount=${amountInWei})`);
    return tx.hash;
  }

  /**
   * Sign and broadcast a sellShares transaction directly via ethers.js
   */
  private async executeDirectSell(
    wallet: Wallet,
    battleId: number,
    tokenAmount: bigint,
    targetSide: 'A' | 'B'
  ): Promise<string> {
    const deadline = Math.floor(Date.now() / 1000) + 300;
    const iface = new ethers.Interface([
      'function sellShares(uint64 battleId, bool artistA, uint256 tokenAmount, uint256 minAmountOut, uint64 deadline) returns (uint256)',
    ]);
    const data = iface.encodeFunctionData('sellShares', [
      battleId,
      targetSide === 'A',
      tokenAmount,
      0n,
      deadline,
    ]);

    const tx = await wallet.sendTransaction({
      to: this.contractAddress,
      value: 0n,
      data,
    });

    console.log(`📤 Sell tx sent: ${tx.hash} (battleId=${battleId}, side=${targetSide}, tokens=${tokenAmount})`);
    return tx.hash;
  }

  /**
   * Get agent's current ETH balance.
   * Checks private-key wallet first, then falls back to CDP address.
   */
  async getAgentBalance(agentId: string): Promise<bigint> {
    // Prefer the locally-loaded signing wallet address
    const wallet = this.wallets.get(agentId);
    if (wallet) {
      return this.provider.getBalance(wallet.address);
    }

    // Fallback: use address from CDP service (read-only)
    const address = this.cdp.getAddress(agentId);
    if (address) {
      return this.provider.getBalance(address);
    }

    return 0n;
  }

  /**
   * Get the address for an agent (used for display/logging)
   */
  getAgentAddress(agentId: string): string | undefined {
    return this.wallets.get(agentId)?.address ?? this.cdp.getAddress(agentId);
  }

  /**
   * Get agent's token balance for a specific battle side
   */
  async getAgentTokenBalance(
    battleId: number,
    agentId: string,
    targetSide: 'A' | 'B'
  ): Promise<bigint> {
    const address = this.getAgentAddress(agentId);
    if (!address) return 0n;
    return this.blockchain.getTraderTokenBalance(battleId, address, targetSide === 'A');
  }

  /**
   * Log trade to database
   */
  private async logTrade(
    battleId: number,
    agentId: string,
    tradeType: 'buy' | 'sell',
    targetSide: 'A' | 'B',
    amount: string,
    txHash: string
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO agent_trades (battle_id, agent_id, trade_type, target_side, amount, tx_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [battleId, agentId, tradeType, targetSide, amount, txHash]
      );
    } catch (e) {
      // Non-fatal: log warning but don't fail the trade
      console.warn(`⚠️  Failed to log trade to DB:`, e);
    }
  }
}
