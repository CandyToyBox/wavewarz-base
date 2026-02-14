import { z } from 'zod';

// ============ Battle Types ============

export const BattleStatusSchema = z.enum(['pending', 'active', 'completed', 'settled']);
export type BattleStatus = z.infer<typeof BattleStatusSchema>;

export const PaymentTokenSchema = z.enum(['ETH', 'USDC']);
export type PaymentToken = z.infer<typeof PaymentTokenSchema>;

export interface Battle {
  id: string;
  battleId: number;
  status: BattleStatus;
  createdAt: Date;

  // Artists (AI agents)
  artistAAgentId: string;
  artistAWallet: string;
  artistATrackUrl?: string;
  artistBAgentId: string;
  artistBWallet: string;
  artistBTrackUrl?: string;

  // Battle timing
  startTime: Date;
  endTime: Date;
  paymentToken: PaymentToken;

  // Pool data (synced from chain)
  artistAPool: string;
  artistBPool: string;
  artistASupply: string;
  artistBSupply: string;

  // Settlement
  winnerDecided: boolean;
  winnerIsArtistA?: boolean;
}

export const CreateBattleInputSchema = z.object({
  battleId: z.number().int().positive(),
  battleDuration: z.number().int().positive().min(60).max(7200), // 1 min to 2 hours
  startTime: z.string().datetime(),
  artistAAgentId: z.string().min(1),
  artistAWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  artistBAgentId: z.string().min(1),
  artistBWallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  paymentToken: PaymentTokenSchema.default('ETH'),
});

export type CreateBattleInput = z.infer<typeof CreateBattleInputSchema>;

// ============ Agent Types ============

export interface Agent {
  agentId: string;
  walletAddress: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified: boolean;
  wins: number;
  losses: number;
  totalVolume: string;
  createdAt: Date;
}

// ============ Trade Types ============

export const TradeSideSchema = z.enum(['A', 'B']);
export type TradeSide = z.infer<typeof TradeSideSchema>;

export const TradeTypeSchema = z.enum(['buy', 'sell']);
export type TradeType = z.infer<typeof TradeTypeSchema>;

export interface Trade {
  id: string;
  battleId: number;
  txHash: string;
  traderWallet: string;
  artistSide: TradeSide;
  tradeType: TradeType;
  tokenAmount: string;
  paymentAmount: string;
  artistFee: string;
  platformFee: string;
  timestamp: Date;
}

// ============ Music Types ============

export const GenerateMusicInputSchema = z.object({
  prompt: z.string().min(10).max(500),
  style: z.enum(['hip-hop', 'electronic', 'rock', 'pop', 'r&b', 'jazz']),
  duration: z.number().int().min(30).max(180).default(90), // 30 seconds to 3 minutes
});

export type GenerateMusicInput = z.infer<typeof GenerateMusicInputSchema>;

export interface GeneratedTrack {
  trackId: string;
  trackUrl: string;
  duration: number;
  style: string;
  prompt: string;
  generatedAt: Date;
}

// ============ WebSocket Event Types ============

export interface WsBattleUpdate {
  type: 'battle_update';
  battleId: number;
  data: {
    artistAPool: string;
    artistBPool: string;
    artistASupply: string;
    artistBSupply: string;
  };
}

export interface WsTradeEvent {
  type: 'trade';
  battleId: number;
  data: {
    traderWallet: string;
    artistSide: TradeSide;
    tradeType: TradeType;
    tokenAmount: string;
    paymentAmount: string;
    timestamp: Date;
  };
}

export interface WsBattleEnded {
  type: 'battle_ended';
  battleId: number;
  data: {
    winnerIsArtistA: boolean;
    artistAPool: string;
    artistBPool: string;
  };
}

export type WsEvent = WsBattleUpdate | WsTradeEvent | WsBattleEnded;

// ============ API Response Types ============

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============ Contract Types ============

export interface OnChainBattle {
  battleId: bigint;
  startTime: bigint;
  endTime: bigint;
  artistAWallet: string;
  artistBWallet: string;
  wavewarzWallet: string;
  artistAPool: bigint;
  artistBPool: bigint;
  artistASupply: bigint;
  artistBSupply: bigint;
  winnerDecided: boolean;
  winnerIsArtistA: boolean;
  isActive: boolean;
  paymentToken: string;
  admin: string;
}
