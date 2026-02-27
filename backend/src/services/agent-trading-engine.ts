/**
 * Agent Trading Engine
 * Orchestrates autonomous trading for AI agents during battles
 * Monitors active battles and executes trades based on strategies
 */

import { Pool } from 'pg';
import type { Battle } from '../types/index.js';
import { BlockchainService } from './blockchain.service.js';
import { BattleService } from './battle.service.js';
import { TradeExecutor } from './trade-executor.js';
import { getStrategyForAgent, type BattleContext, type TradeDecision } from './trading-strategy.js';

interface ActiveBattleMonitor {
  battleId: number;
  agentA_id: string;
  agentB_id: string;
  startTime: Date;
  endTime: Date;
  lastTradeCheck: Date;
  tradeCheckIntervalMs: number;
  status: 'active' | 'ended';
}

interface AgentBattleState {
  agentId: string;
  battleId: number;
  currentBalance: bigint;
  tokensHeld: bigint;
  totalBuys: number;
  totalSells: number;
  trades: TradeDecision[];
}

export class AgentTradingEngine {
  private pool: Pool;
  private blockchain: BlockchainService;
  private battleService: BattleService;
  private tradeExecutor: TradeExecutor;
  private activeBattles = new Map<number, ActiveBattleMonitor>();
  private agentStates = new Map<string, AgentBattleState>();
  private monitoringLoopRunning = false;
  private checkIntervalMs = 5000; // Check every 5 seconds

  constructor(
    databaseUrl: string,
    blockchain: BlockchainService,
    battleService: BattleService,
    tradeExecutor: TradeExecutor
  ) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
    this.blockchain = blockchain;
    this.battleService = battleService;
    this.tradeExecutor = tradeExecutor;
  }

  /**
   * Start the trading engine monitoring loop
   */
  async start(): Promise<void> {
    if (this.monitoringLoopRunning) {
      console.warn('Agent Trading Engine already running');
      return;
    }

    this.monitoringLoopRunning = true;
    console.log('🤖 Agent Trading Engine started');

    // Start monitoring loop
    setInterval(() => this.runMonitoringCycle(), this.checkIntervalMs);

    // Initial load of active battles
    await this.loadActiveBattles();
  }

  /**
   * Stop the trading engine
   */
  async stop(): Promise<void> {
    this.monitoringLoopRunning = false;
    console.log('🤖 Agent Trading Engine stopped');
  }

  /**
   * Load all active battles from database
   */
  private async loadActiveBattles(): Promise<void> {
    try {
      const result = await this.pool.query(
        `SELECT battle_id, artist_a_agent_id, artist_b_agent_id, start_time, end_time
         FROM base_battles
         WHERE status IN ('pending', 'active')
         ORDER BY created_at DESC`
      );

      this.activeBattles.clear();

      for (const row of result.rows) {
        const battleId = row.battle_id as number;
        const agentA = row.artist_a_agent_id as string;
        const agentB = row.artist_b_agent_id as string;

        this.activeBattles.set(battleId, {
          battleId,
          agentA_id: agentA,
          agentB_id: agentB,
          startTime: new Date(row.start_time as string),
          endTime: new Date(row.end_time as string),
          lastTradeCheck: new Date(),
          tradeCheckIntervalMs: this.checkIntervalMs,
          status: 'active',
        });

        // Initialize agent states
        this.getOrCreateAgentState(agentA, battleId);
        this.getOrCreateAgentState(agentB, battleId);

        console.log(`📊 Monitoring battle ${battleId}: ${agentA} vs ${agentB}`);
      }
    } catch (error) {
      console.error('Failed to load active battles:', error);
    }
  }

  /**
   * Main monitoring cycle - runs periodically
   */
  private async runMonitoringCycle(): Promise<void> {
    if (!this.monitoringLoopRunning) {
      return;
    }

    // Reload active battles every cycle so new battles created after startup are picked up
    await this.loadActiveBattles();

    if (this.activeBattles.size === 0) {
      return;
    }

    for (const [battleId, monitor] of this.activeBattles.entries()) {
      try {
        await this.processBattle(battleId, monitor);
      } catch (error) {
        console.error(`Error processing battle ${battleId}:`, error);
      }
    }
  }

  /**
   * Process a single active battle
   */
  private async processBattle(battleId: number, monitor: ActiveBattleMonitor): Promise<void> {
    // Check if battle has ended
    const now = new Date();
    if (now >= monitor.endTime) {
      await this.handleBattleEnd(battleId, monitor);
      return;
    }

    // Check agents and execute trades
    await this.evaluateAndExecuteTrades(battleId, monitor);
  }

  /**
   * Evaluate market conditions and execute trades for agents
   */
  private async evaluateAndExecuteTrades(
    battleId: number,
    monitor: ActiveBattleMonitor
  ): Promise<void> {
    const battle = await this.battleService.getBattle(battleId);
    if (!battle) {
      console.warn(`Battle ${battleId} not found in database`);
      return;
    }

    const now = new Date();
    const elapsedSeconds = Math.floor((now.getTime() - monitor.startTime.getTime()) / 1000);
    const totalDurationSeconds = Math.floor(
      (monitor.endTime.getTime() - monitor.startTime.getTime()) / 1000
    );
    const percentComplete = Math.min(elapsedSeconds / totalDurationSeconds, 1.0);

    // Get on-chain battle state
    const chainBattle = await this.blockchain.getBattle(battleId);
    if (!chainBattle) {
      return;
    }

    // Process trades for both agents
    for (const agentId of [monitor.agentA_id, monitor.agentB_id]) {
      await this.evaluateAgentTrade(
        battleId,
        agentId,
        agentId === monitor.agentA_id ? 'A' : 'B',
        {
          battleId,
          elapsedSeconds,
          totalDurationSeconds,
          percentComplete,
          artistAPool: chainBattle.artistAPool,
          artistBPool: chainBattle.artistBPool,
          artistASupply: chainBattle.artistASupply,
          artistBSupply: chainBattle.artistBSupply,
          agentSide: agentId === monitor.agentA_id ? 'A' : 'B',
          agentWallet:
            agentId === monitor.agentA_id
              ? battle.artistAWallet
              : battle.artistBWallet,
          agentBalance: 0n, // Will fetch
          agentTokensHeld: 0n, // Will fetch
          artistAPrice:
            chainBattle.artistASupply > 0n
              ? Number(chainBattle.artistAPool) / Number(chainBattle.artistASupply)
              : 0,
          artistBPrice:
            chainBattle.artistBSupply > 0n
              ? Number(chainBattle.artistBPool) / Number(chainBattle.artistBSupply)
              : 0,
          totalVolume: chainBattle.artistAPool + chainBattle.artistBPool,
          previousBuys: 0, // Will fetch from stats
          previousSells: 0, // Will fetch from stats
        }
      );
    }
  }

  /**
   * Evaluate and execute trade for a single agent
   */
  private async evaluateAgentTrade(
    battleId: number,
    agentId: string,
    agentSide: 'A' | 'B',
    context: Partial<BattleContext>
  ): Promise<void> {
    try {
      // Fetch current balance and tokens
      const balance = await this.tradeExecutor.getAgentBalance(agentId);
      const tokensHeld = await this.tradeExecutor.getAgentTokenBalance(battleId, agentId, agentSide);
      console.log(`💰 Agent ${agentId} (Side ${agentSide}): balance=${balance.toString()} wei, tokens=${tokensHeld.toString()}`);

      // Complete the context
      const fullContext: BattleContext = {
        battleId: context.battleId!,
        elapsedSeconds: context.elapsedSeconds!,
        totalDurationSeconds: context.totalDurationSeconds!,
        percentComplete: context.percentComplete!,
        artistAPool: context.artistAPool!,
        artistBPool: context.artistBPool!,
        artistASupply: context.artistASupply!,
        artistBSupply: context.artistBSupply!,
        agentWallet: context.agentWallet!,
        agentSide,
        agentBalance: balance,
        agentTokensHeld: tokensHeld,
        artistAPrice: context.artistAPrice!,
        artistBPrice: context.artistBPrice!,
        totalVolume: context.totalVolume!,
        previousBuys: context.previousBuys!,
        previousSells: context.previousSells!,
      };

      // Get trading strategy for this agent
      const strategy = getStrategyForAgent(agentId, agentId);

      // Get trade decision
      const decision = strategy.decide(fullContext);
      console.log(`🧠 Decision for ${agentId}: shouldTrade=${decision.shouldTrade}, type=${decision.tradeType}, amount=${decision.amount}, reason=${decision.reason}`);

      // Log the decision
      await this.logTradeDecision(battleId, agentId, decision);

      // Execute if shouldTrade
      if (decision.shouldTrade && decision.amount) {
        const amount = BigInt(decision.amount);

        if (decision.tradeType === 'buy') {
          if (balance >= amount) {
            const result = await this.tradeExecutor.executeBuyTrade(
              battleId,
              agentId,
              amount,
              decision.targetSide
            );

            if (result.success) {
              console.log(
                `✅ Buy trade executed: ${agentId} bought ${amount.toString()} on Artist ${decision.targetSide} (txHash: ${result.txHash})`
              );
            } else {
              console.warn(`❌ Buy trade failed for ${agentId}: ${result.error}`);
            }
          } else {
            console.warn(
              `⚠️ Insufficient balance for ${agentId}: need ${amount.toString()}, have ${balance.toString()}`
            );
          }
        } else if (decision.tradeType === 'sell') {
          if (tokensHeld >= amount) {
            const result = await this.tradeExecutor.executeSellTrade(
              battleId,
              agentId,
              amount,
              decision.targetSide
            );

            if (result.success) {
              console.log(
                `✅ Sell trade executed: ${agentId} sold ${amount.toString()} tokens (txHash: ${result.txHash})`
              );
            } else {
              console.warn(`❌ Sell trade failed for ${agentId}: ${result.error}`);
            }
          } else {
            console.warn(
              `⚠️ Insufficient tokens for ${agentId}: need ${amount.toString()}, have ${tokensHeld.toString()}`
            );
          }
        }
      }
    } catch (error) {
      console.error(`Error evaluating trade for ${agentId}:`, error);
    }
  }

  /**
   * Handle battle end - clean up and settle
   */
  private async handleBattleEnd(battleId: number, monitor: ActiveBattleMonitor): Promise<void> {
    console.log(`🏁 Battle ${battleId} has ended, cleaning up...`);

    // Remove from active battles
    this.activeBattles.delete(battleId);

    // Clean up agent states
    this.agentStates.delete(monitor.agentA_id);
    this.agentStates.delete(monitor.agentB_id);

    // Update battle status to completed
    try {
      await this.pool.query(
        'UPDATE base_battles SET status = $1 WHERE battle_id = $2',
        ['completed', battleId]
      );
    } catch (error) {
      console.error(`Failed to update battle status for ${battleId}:`, error);
    }
  }

  /**
   * Log trade decision for auditing
   */
  private async logTradeDecision(
    battleId: number,
    agentId: string,
    decision: TradeDecision
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO agent_trade_decisions (battle_id, agent_id, trade_type, confidence, reason)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [battleId, agentId, decision.tradeType, decision.confidence, decision.reason]
      );
    } catch (error) {
      // Silently fail - table might not exist yet
    }
  }

  /**
   * Get or create agent state for a battle
   */
  private getOrCreateAgentState(agentId: string, battleId: number): AgentBattleState {
    const key = `${agentId}:${battleId}`;
    if (!this.agentStates.has(key)) {
      this.agentStates.set(key, {
        agentId,
        battleId,
        currentBalance: 0n,
        tokensHeld: 0n,
        totalBuys: 0,
        totalSells: 0,
        trades: [],
      });
    }
    return this.agentStates.get(key)!;
  }

  /**
   * Get stats for an agent in a battle
   */
  async getAgentBattleStats(
    agentId: string,
    battleId: number
  ): Promise<{
    trades: TradeDecision[];
    balance: bigint;
    tokensHeld: bigint;
  } | null> {
    const state = this.agentStates.get(`${agentId}:${battleId}`);
    if (!state) {
      return null;
    }

    return {
      trades: state.trades,
      balance: state.currentBalance,
      tokensHeld: state.tokensHeld,
    };
  }
}
