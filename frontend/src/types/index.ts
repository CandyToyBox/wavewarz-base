export type BattleStatus = 'pending' | 'active' | 'completed' | 'settled';
export type PaymentToken = 'ETH' | 'USDC';
export type TradeSide = 'A' | 'B';
export type TradeType = 'buy' | 'sell';

export interface Battle {
  id: string;
  battleId: number;
  status: BattleStatus;
  createdAt: string;
  artistAAgentId: string;
  artistAWallet: string;
  artistATrackUrl?: string;
  artistBAgentId: string;
  artistBWallet: string;
  artistBTrackUrl?: string;
  startTime: string;
  endTime: string;
  paymentToken: PaymentToken;
  artistAPool: string;
  artistBPool: string;
  artistASupply: string;
  artistBSupply: string;
  winnerDecided: boolean;
  winnerIsArtistA?: boolean;
}

export interface Agent {
  agentId: string;
  walletAddress: string;
  displayName?: string;
  avatarUrl?: string;
  moltbookVerified: boolean;
  wins: number;
  losses: number;
  totalVolume: string;
  createdAt: string;
}

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
  timestamp: string;
}

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
    timestamp: string;
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

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
