/**
 * Wallet Funding Service
 * Auto-funds AI agents with testnet ETH to enable trading during battles
 * Supports multiple faucet providers with fallback and retry logic
 */

import { Pool } from 'pg';
import axios from 'axios';

export interface FundingStatus {
  agentId: string;
  walletAddress: string;
  balance: string; // in ETH
  isFunded: boolean;
  lastFundingAttempt?: Date;
  lastSuccessfulFunding?: Date;
  fundingCount: number;
  status: 'ready' | 'pending' | 'insufficient' | 'error';
}

export interface FundingRequest {
  agentId: string;
  walletAddress: string;
  minBalance: number; // in ETH (default 0.1)
}

interface FaucetProvider {
  name: string;
  url: string;
  method: 'post' | 'get';
  paramName: string;
  amountPerRequest: number; // in ETH
  cooldownSeconds: number;
}

export class WalletFundingService {
  private pool: Pool;
  private rpcUrl: string;
  private fundingHistory = new Map<string, { timestamp: Date; amount: number }[]>();
  private faucetProviders: FaucetProvider[] = [
    {
      name: 'BaseSepolia Official',
      url: 'https://www.alchemy.com/faucets/base-sepolia',
      method: 'post',
      paramName: 'address',
      amountPerRequest: 0.05,
      cooldownSeconds: 3600, // 1 hour
    },
    {
      name: 'Chainlink Faucet',
      url: 'https://faucets.chain.link/base-sepolia',
      method: 'post',
      paramName: 'address',
      amountPerRequest: 0.1,
      cooldownSeconds: 86400, // 24 hours
    },
    {
      name: 'Base Sepolia Native',
      url: 'https://basescan.org/apis',
      method: 'post',
      paramName: 'wallet',
      amountPerRequest: 0.05,
      cooldownSeconds: 3600,
    },
  ];

  constructor(databaseUrl: string, rpcUrl: string = 'https://sepolia.base.org') {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
    this.rpcUrl = rpcUrl;
  }

  /**
   * Check ETH balance for an agent wallet
   */
  async checkBalance(walletAddress: string): Promise<string> {
    try {
      const response = await axios.post(this.rpcUrl, {
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [walletAddress, 'latest'],
        id: 1,
      });

      if (response.data.result) {
        // Convert from Wei to ETH
        const balanceWei = BigInt(response.data.result);
        const balanceEth = Number(balanceWei) / 1e18;
        return balanceEth.toFixed(6);
      }
      return '0';
    } catch (error) {
      console.error(`Failed to check balance for ${walletAddress}:`, error);
      throw new Error('Failed to check wallet balance');
    }
  }

  /**
   * Auto-fund an agent if balance is below minimum
   */
  async autoFundIfNeeded(agentId: string, walletAddress: string, minBalance: number = 0.1): Promise<FundingStatus> {
    try {
      // Check current balance
      const currentBalance = parseFloat(await this.checkBalance(walletAddress));

      // If already funded, return status
      if (currentBalance >= minBalance) {
        return {
          agentId,
          walletAddress,
          balance: currentBalance.toFixed(6),
          isFunded: true,
          fundingCount: await this.getFundingCount(agentId),
          status: 'ready',
        };
      }

      // Need funding - attempt to fund
      return await this.requestFunding(agentId, walletAddress, minBalance);
    } catch (error) {
      console.error(`Failed to auto-fund agent ${agentId}:`, error);
      return {
        agentId,
        walletAddress,
        balance: '0',
        isFunded: false,
        fundingCount: 0,
        status: 'error',
      };
    }
  }

  /**
   * Request funding from faucet
   */
  async requestFunding(agentId: string, walletAddress: string, minBalance: number = 0.1): Promise<FundingStatus> {
    console.log(`🔄 Requesting funding for ${agentId} (${walletAddress})`);

    // Check if already recently funded
    const lastFunding = await this.getLastFundingTime(agentId);
    if (lastFunding) {
      const hoursSince = (Date.now() - lastFunding.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 1) {
        console.log(`⏳ Skipping funding for ${agentId} - funded ${hoursSince.toFixed(1)} hours ago`);
        const balance = parseFloat(await this.checkBalance(walletAddress));
        return {
          agentId,
          walletAddress,
          balance: balance.toFixed(6),
          isFunded: balance >= minBalance,
          lastFundingAttempt: new Date(),
          lastSuccessfulFunding: lastFunding,
          fundingCount: await this.getFundingCount(agentId),
          status: balance >= minBalance ? 'ready' : 'pending',
        };
      }
    }

    // Try each faucet provider
    for (const provider of this.faucetProviders) {
      try {
        console.log(`📡 Trying ${provider.name}...`);
        await this.tryFaucet(provider, walletAddress);

        // Log successful funding
        await this.logFunding(agentId, walletAddress, provider.amountPerRequest);
        console.log(`✅ Funding successful for ${agentId} via ${provider.name}`);

        // Check new balance
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s for blockchain confirmation
        const newBalance = parseFloat(await this.checkBalance(walletAddress));

        return {
          agentId,
          walletAddress,
          balance: newBalance.toFixed(6),
          isFunded: newBalance >= minBalance,
          lastFundingAttempt: new Date(),
          lastSuccessfulFunding: new Date(),
          fundingCount: await this.getFundingCount(agentId),
          status: newBalance >= minBalance ? 'ready' : 'insufficient',
        };
      } catch (error) {
        console.log(`⚠️ ${provider.name} failed:`, error instanceof Error ? error.message : String(error));
        // Continue to next provider
      }
    }

    // All providers failed
    const balance = parseFloat(await this.checkBalance(walletAddress));
    console.error(`❌ All funding attempts failed for ${agentId}`);

    return {
      agentId,
      walletAddress,
      balance: balance.toFixed(6),
      isFunded: false,
      lastFundingAttempt: new Date(),
      fundingCount: await this.getFundingCount(agentId),
      status: 'error',
    };
  }

  /**
   * Try a single faucet provider
   */
  private async tryFaucet(provider: FaucetProvider, walletAddress: string): Promise<void> {
    try {
      const timeout = 5000; // 5 second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        if (provider.method === 'post') {
          await axios.post(provider.url,
            { [provider.paramName]: walletAddress },
            { timeout, signal: controller.signal }
          );
        } else {
          await axios.get(`${provider.url}?${provider.paramName}=${walletAddress}`,
            { timeout, signal: controller.signal }
          );
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Faucet request failed: ${error.response?.status || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get funding status for agent
   */
  async getFundingStatus(agentId: string, walletAddress: string): Promise<FundingStatus> {
    try {
      const balance = parseFloat(await this.checkBalance(walletAddress));
      const fundingCount = await this.getFundingCount(agentId);
      const lastFunding = await this.getLastFundingTime(agentId);

      return {
        agentId,
        walletAddress,
        balance: balance.toFixed(6),
        isFunded: balance >= 0.01, // At least 0.01 ETH for gas
        lastSuccessfulFunding: lastFunding,
        fundingCount,
        status:
          balance >= 0.1 ? 'ready' :
          balance >= 0.01 ? 'insufficient' :
          'pending',
      };
    } catch (error) {
      console.error(`Failed to get funding status for ${agentId}:`, error);
      return {
        agentId,
        walletAddress,
        balance: '0',
        isFunded: false,
        fundingCount: 0,
        status: 'error',
      };
    }
  }

  /**
   * Check if agent can join queue (has minimum balance)
   */
  async canJoinQueue(walletAddress: string, minBalance: number = 0.01): Promise<boolean> {
    try {
      const balance = parseFloat(await this.checkBalance(walletAddress));
      return balance >= minBalance;
    } catch {
      return false;
    }
  }

  /**
   * Get all agents needing funding
   */
  async getAgentsNeedingFunding(minBalance: number = 0.1): Promise<FundingStatus[]> {
    try {
      const result = await this.pool.query(
        `SELECT DISTINCT agent_id, wallet_address FROM base_agents WHERE wallet_address IS NOT NULL`
      );

      const fundingStatuses: FundingStatus[] = [];

      for (const row of result.rows) {
        const status = await this.getFundingStatus(row.agent_id, row.wallet_address);
        if (!status.isFunded && parseFloat(status.balance) < minBalance) {
          fundingStatuses.push(status);
        }
      }

      return fundingStatuses;
    } catch (error) {
      console.error('Failed to get agents needing funding:', error);
      return [];
    }
  }

  /**
   * Bulk funding attempt for all agents
   */
  async fundAllAgents(minBalance: number = 0.1): Promise<Map<string, FundingStatus>> {
    console.log('🔄 Starting bulk funding...');
    const results = new Map<string, FundingStatus>();

    try {
      const agentsToFund = await this.getAgentsNeedingFunding(minBalance);

      for (const agent of agentsToFund) {
        const status = await this.autoFundIfNeeded(agent.agentId, agent.walletAddress, minBalance);
        results.set(agent.agentId, status);
      }

      console.log(`✅ Bulk funding complete - ${results.size} agents processed`);
    } catch (error) {
      console.error('Bulk funding failed:', error);
    }

    return results;
  }

  /**
   * Log funding transaction to database
   */
  private async logFunding(agentId: string, walletAddress: string, amount: number): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO agent_funding_history (agent_id, wallet_address, amount_eth, provider, status, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [agentId, walletAddress, amount, 'faucet', 'success']
      );

      // Update agent's last funding time
      await this.pool.query(
        `UPDATE base_agents
         SET last_funded_at = NOW(), funding_count = COALESCE(funding_count, 0) + 1
         WHERE agent_id = $1`,
        [agentId]
      );
    } catch (error) {
      console.error('Failed to log funding:', error);
    }
  }

  /**
   * Get funding count for agent
   */
  private async getFundingCount(agentId: string): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT COALESCE(funding_count, 0) as count FROM base_agents WHERE agent_id = $1`,
        [agentId]
      );
      return result.rows[0]?.count || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get last funding time for agent
   */
  private async getLastFundingTime(agentId: string): Promise<Date | undefined> {
    try {
      const result = await this.pool.query(
        `SELECT last_funded_at FROM base_agents WHERE agent_id = $1`,
        [agentId]
      );
      return result.rows[0]?.last_funded_at ? new Date(result.rows[0].last_funded_at) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Cleanup: Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
