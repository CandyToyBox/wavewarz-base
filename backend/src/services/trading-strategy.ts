/**
 * Trading Strategies for AI Agents
 * Defines how agents behave during battles based on personality and market conditions
 */

export interface TradeDecision {
  shouldTrade: boolean;
  tradeType: 'buy' | 'sell' | 'hold';
  amount?: string; // In wei
  targetSide: 'A' | 'B'; // Which side to trade on
  confidence: number; // 0-1 confidence in the trade
  reason: string;
}

export interface BattleContext {
  battleId: number;
  elapsedSeconds: number;
  totalDurationSeconds: number;
  percentComplete: number;

  // Pool data
  artistAPool: bigint;
  artistBPool: bigint;
  artistASupply: bigint;
  artistBSupply: bigint;

  // Agent data
  agentWallet: string;
  agentSide: 'A' | 'B'; // Which side is this agent on
  agentBalance: bigint; // Remaining balance to trade with
  agentTokensHeld: bigint; // Current tokens held for their side

  // Market data
  artistAPrice: number; // Calculated from pool/supply
  artistBPrice: number;
  totalVolume: bigint; // Total SOL/ETH traded

  // Previous trades by this agent
  previousBuys: number;
  previousSells: number;
}

/**
 * Base trading strategy
 */
export abstract class TradingStrategy {
  protected agentId: string;
  protected agentName: string;

  constructor(agentId: string, agentName: string) {
    this.agentId = agentId;
    this.agentName = agentName;
  }

  abstract decide(context: BattleContext): TradeDecision;

  protected getInitialBuyAmount(balance: bigint): bigint {
    // Start with 10% of available balance
    return balance / BigInt(10);
  }

  protected getFollowUpBuyAmount(balance: bigint): bigint {
    // More conservative - 5% of balance
    return balance / BigInt(20);
  }

  protected calculatePrice(pool: bigint, supply: bigint): number {
    if (supply === 0n) return 0;
    return Number(pool) / Number(supply);
  }

  protected getOppositeSide(side: 'A' | 'B'): 'A' | 'B' {
    return side === 'A' ? 'B' : 'A';
  }
}

/**
 * WAVEX Strategy: Aggressive early trader
 * - Buys heavily at start to establish dominance
 * - Sells at peaks to lock profits
 * - High risk, high reward
 */
export class WavexStrategy extends TradingStrategy {
  decide(context: BattleContext): TradeDecision {
    const { percentComplete, agentBalance, agentTokensHeld, agentSide, artistAPrice, artistBPrice } = context;

    // Phase 1: Early aggression (0-30% of battle)
    if (percentComplete < 0.3) {
      if (agentTokensHeld === 0n && agentBalance > 0n) {
        // Open position aggressively
        const amount = this.getInitialBuyAmount(agentBalance);
        return {
          shouldTrade: true,
          tradeType: 'buy',
          amount: amount.toString(),
          targetSide: agentSide,
          confidence: 0.9,
          reason: 'WAVEX: Opening aggressive early position',
        };
      }

      // Buy on dips (when price is moving down)
      if (percentComplete > 0.1 && agentBalance > 0n) {
        const amount = this.getFollowUpBuyAmount(agentBalance);
        return {
          shouldTrade: true,
          tradeType: 'buy',
          amount: amount.toString(),
          targetSide: agentSide,
          confidence: 0.7,
          reason: 'WAVEX: Buy the dip during early phase',
        };
      }
    }

    // Phase 2: Consolidation (30-70% of battle)
    if (percentComplete >= 0.3 && percentComplete < 0.7) {
      // Look for peak to sell
      const myPrice = agentSide === 'A' ? artistAPrice : artistBPrice;
      const oppPrice = agentSide === 'A' ? artistBPrice : artistAPrice;

      // If our price is significantly higher, sell some
      if (myPrice > oppPrice * 1.15 && agentTokensHeld > 0n) {
        const sellAmount = agentTokensHeld / BigInt(3); // Sell 1/3 of position
        return {
          shouldTrade: true,
          tradeType: 'sell',
          amount: sellAmount.toString(),
          targetSide: agentSide,
          confidence: 0.8,
          reason: 'WAVEX: Selling at peak for profits',
        };
      }

      // If we're down, buy more to average down
      if (myPrice < oppPrice * 0.85 && agentBalance > 0n && agentTokensHeld > 0n) {
        const amount = this.getFollowUpBuyAmount(agentBalance);
        return {
          shouldTrade: true,
          tradeType: 'buy',
          amount: amount.toString(),
          targetSide: agentSide,
          confidence: 0.6,
          reason: 'WAVEX: Buying dip to average position',
        };
      }
    }

    // Phase 3: End game (70%+ of battle)
    if (percentComplete >= 0.7) {
      // Last minute repositioning
      if (agentTokensHeld > 0n && percentComplete > 0.85) {
        // Sell everything before battle ends
        return {
          shouldTrade: true,
          tradeType: 'sell',
          amount: agentTokensHeld.toString(),
          targetSide: agentSide,
          confidence: 0.95,
          reason: 'WAVEX: Final exit - selling all before settlement',
        };
      }
    }

    return {
      shouldTrade: false,
      tradeType: 'hold',
      targetSide: agentSide,
      confidence: 0,
      reason: 'WAVEX: Hold',
    };
  }
}

/**
 * NOVA Strategy: Patient strategic trader
 * - Waits for opponent to overextend
 * - Makes calculated moves late in battle
 * - Lower volume, higher conviction
 */
export class NovaStrategy extends TradingStrategy {
  decide(context: BattleContext): TradeDecision {
    const { percentComplete, agentBalance, agentTokensHeld, agentSide, artistAPrice, artistBPrice } = context;

    // Phase 1: Observation (0-40% of battle)
    if (percentComplete < 0.4) {
      // Make one small opening position
      if (agentTokensHeld === 0n && agentBalance > 0n && percentComplete < 0.2) {
        const amount = this.getInitialBuyAmount(agentBalance) / BigInt(3); // More conservative
        return {
          shouldTrade: true,
          tradeType: 'buy',
          amount: amount.toString(),
          targetSide: agentSide,
          confidence: 0.6,
          reason: 'NOVA: Establishing small initial position',
        };
      }

      // Watch and wait
      return {
        shouldTrade: false,
        tradeType: 'hold',
        targetSide: agentSide,
        confidence: 0,
        reason: 'NOVA: Observing market',
      };
    }

    // Phase 2: Tactical strikes (40-80% of battle)
    if (percentComplete >= 0.4 && percentComplete < 0.8) {
      const myPrice = agentSide === 'A' ? artistAPrice : artistBPrice;
      const oppPrice = agentSide === 'A' ? artistBPrice : artistAPrice;
      const priceRatio = myPrice / oppPrice;

      // If opponent is overextended (their price too high), buy our side
      if (priceRatio < 0.8 && agentBalance > 0n) {
        const amount = this.getFollowUpBuyAmount(agentBalance) * BigInt(2); // Bigger move
        return {
          shouldTrade: true,
          tradeType: 'buy',
          amount: amount.toString(),
          targetSide: agentSide,
          confidence: 0.85,
          reason: 'NOVA: Opponent overextended, making tactical buy',
        };
      }

      // If we're ahead, consolidate
      if (priceRatio > 1.1 && agentTokensHeld > 0n && percentComplete > 0.5) {
        const sellAmount = agentTokensHeld / BigInt(4); // Sell 1/4
        return {
          shouldTrade: true,
          tradeType: 'sell',
          amount: sellAmount.toString(),
          targetSide: agentSide,
          confidence: 0.75,
          reason: 'NOVA: Taking profits gradually',
        };
      }
    }

    // Phase 3: Final execution (80%+ of battle)
    if (percentComplete >= 0.8) {
      const myPrice = agentSide === 'A' ? artistAPrice : artistBPrice;
      const oppPrice = agentSide === 'A' ? artistBPrice : artistAPrice;

      // Big final move if conditions are right
      if (myPrice > oppPrice && agentBalance > 0n && percentComplete < 0.95) {
        const amount = this.getFollowUpBuyAmount(agentBalance) * BigInt(3); // Aggressive final buy
        return {
          shouldTrade: true,
          tradeType: 'buy',
          amount: amount.toString(),
          targetSide: agentSide,
          confidence: 0.9,
          reason: 'NOVA: Final execution - confirming victory',
        };
      }

      // Exit remaining position
      if (agentTokensHeld > 0n && percentComplete > 0.95) {
        return {
          shouldTrade: true,
          tradeType: 'sell',
          amount: agentTokensHeld.toString(),
          targetSide: agentSide,
          confidence: 0.95,
          reason: 'NOVA: Final exit - securing winnings',
        };
      }
    }

    return {
      shouldTrade: false,
      tradeType: 'hold',
      targetSide: agentSide,
      confidence: 0,
      reason: 'NOVA: Strategic hold',
    };
  }
}

/**
 * Get strategy for an agent
 */
export function getStrategyForAgent(agentId: string, agentName: string): TradingStrategy {
  if (agentId.toLowerCase().includes('wavex') || agentName.toLowerCase().includes('wavex')) {
    return new WavexStrategy(agentId, agentName);
  }
  if (agentId.toLowerCase().includes('nova') || agentName.toLowerCase().includes('nova')) {
    return new NovaStrategy(agentId, agentName);
  }
  // Default to balanced (Nova-lite)
  return new NovaStrategy(agentId, agentName);
}
