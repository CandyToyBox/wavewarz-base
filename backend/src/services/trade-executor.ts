/**
 * Trade Executor
 * Handles signing and executing trades on-chain via agent wallets
 * Supports CDP wallets for WAVEX/NOVA and external agent wallets
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

export class TradeExecutor {
  private pool: Pool;
  private blockchain: BlockchainService;
  private cdp: CdpService;
  private rpcUrl: string;
  private contractAddress: string;

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
  }

  /**
   * Execute a buy trade (needs to send ETH along with transaction)
   */
  async executeBuyTrade(
    battleId: number,
    agentId: string,
    amountInWei: bigint,
    targetSide: 'A' | 'B'
  ): Promise<TradeExecutionResult> {
    try {
      // Check if agent is CDP-managed (WAVEX/NOVA)
      const isCdpAgent = this.cdp.isAgentManaged(agentId);

      let txHash: string;

      if (isCdpAgent) {
        txHash = await this.executeCdpBuyTrade(battleId, agentId, amountInWei, targetSide);
      } else {
        // For external agents, we would prepare the transaction
        // and expect the agent to sign it themselves
        // For now, return an error since we can't sign for external wallets
        return {
          success: false,
          error: 'External agent wallets must sign transactions themselves',
        };
      }

      // Log the trade
      await this.logTrade(battleId, agentId, 'buy', targetSide, amountInWei.toString(), txHash);

      return {
        success: true,
        txHash,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMsg,
        details: 'Buy trade execution failed',
      };
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
      const isCdpAgent = this.cdp.isAgentManaged(agentId);

      let txHash: string;

      if (isCdpAgent) {
        txHash = await this.executeCdpSellTrade(battleId, agentId, tokenAmount, targetSide);
      } else {
        return {
          success: false,
          error: 'External agent wallets must sign transactions themselves',
        };
      }

      // Log the trade
      await this.logTrade(battleId, agentId, 'sell', targetSide, tokenAmount.toString(), txHash);

      return {
        success: true,
        txHash,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMsg,
        details: 'Sell trade execution failed',
      };
    }
  }

  /**
   * Execute buy trade via CDP (for WAVEX/NOVA agents)
   */
  private async executeCdpBuyTrade(
    battleId: number,
    agentId: string,
    amountInWei: bigint,
    targetSide: 'A' | 'B'
  ): Promise<string> {
    const account = this.cdp.getAgentWallet(agentId);
    if (!account) {
      throw new Error(`No CDP wallet found for agent ${agentId}`);
    }

    // Calculate deadline (5 minutes from now)
    const deadline = Math.floor(Date.now() / 1000) + 300;

    try {
      // Use CDP's executeContract method
      const data = this.encodeBuySharesData(battleId, targetSide === 'A', amountInWei, deadline);
      const result = await this.cdp.getClient()?.evm.sendTransaction({
        address: account.address,
        network: 'base-sepolia',
        transaction: {
          to: this.contractAddress as `0x${string}`,
          value: amountInWei,
          data: data as `0x${string}`,
        },
      });

      if (!result) {
        throw new Error('Failed to execute trade');
      }

      return result.transactionHash;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`CDP buy trade failed: ${errorMsg}`);
    }
  }

  /**
   * Execute sell trade via CDP (for WAVEX/NOVA agents)
   */
  private async executeCdpSellTrade(
    battleId: number,
    agentId: string,
    tokenAmount: bigint,
    targetSide: 'A' | 'B'
  ): Promise<string> {
    const account = this.cdp.getAgentWallet(agentId);
    if (!account) {
      throw new Error(`No CDP wallet found for agent ${agentId}`);
    }

    // Calculate deadline
    const deadline = Math.floor(Date.now() / 1000) + 300;

    try {
      // Use CDP's executeContract method
      const data = this.encodeSellSharesData(battleId, targetSide === 'A', tokenAmount, deadline);
      const result = await this.cdp.getClient()?.evm.sendTransaction({
        address: account.address,
        network: 'base-sepolia',
        transaction: {
          to: this.contractAddress as `0x${string}`,
          value: 0n,
          data: data as `0x${string}`,
        },
      });

      if (!result) {
        throw new Error('Failed to execute trade');
      }

      return result.transactionHash;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`CDP sell trade failed: ${errorMsg}`);
    }
  }

  /**
   * Encode buyShares function call data
   */
  private encodeBuySharesData(
    battleId: number,
    artistA: boolean,
    amount: bigint,
    deadline: number
  ): string {
    const iface = new ethers.Interface([
      'function buyShares(uint64 battleId, bool artistA, uint256 amount, uint256 minTokensOut, uint64 deadline) payable returns (uint256)',
    ]);

    return iface.encodeFunctionData('buyShares', [
      battleId,
      artistA,
      amount,
      0n, // minTokensOut = 0 (no slippage protection)
      deadline,
    ]);
  }

  /**
   * Encode sellShares function call data
   */
  private encodeSellSharesData(
    battleId: number,
    artistA: boolean,
    tokenAmount: bigint,
    deadline: number
  ): string {
    const iface = new ethers.Interface([
      'function sellShares(uint64 battleId, bool artistA, uint256 tokenAmount, uint256 minAmountOut, uint64 deadline) returns (uint256)',
    ]);

    return iface.encodeFunctionData('sellShares', [
      battleId,
      artistA,
      tokenAmount,
      0n, // minAmountOut = 0 (no slippage protection)
      deadline,
    ]);
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
    await this.pool.query(
      `INSERT INTO agent_trades (battle_id, agent_id, trade_type, target_side, amount, tx_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [battleId, agentId, tradeType, targetSide, amount, txHash]
    );
  }

  /**
   * Get agent's current balance
   */
  async getAgentBalance(agentId: string): Promise<bigint> {
    const isCdpAgent = this.cdp.isAgentManaged(agentId);

    if (isCdpAgent) {
      const wallet = this.cdp.getAgentWallet(agentId);
      if (!wallet) return 0n;

      const provider = new JsonRpcProvider(this.rpcUrl);
      return provider.getBalance(wallet.address);
    }

    return 0n;
  }

  /**
   * Get agent's token balance for a specific battle side
   */
  async getAgentTokenBalance(
    battleId: number,
    agentId: string,
    targetSide: 'A' | 'B'
  ): Promise<bigint> {
    const isCdpAgent = this.cdp.isAgentManaged(agentId);

    if (isCdpAgent) {
      const wallet = this.cdp.getAgentWallet(agentId);
      if (!wallet) return 0n;

      return this.blockchain.getTraderTokenBalance(battleId, wallet.address, targetSide === 'A');
    }

    return 0n;
  }
}
