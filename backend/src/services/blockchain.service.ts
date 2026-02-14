import { ethers, Contract, Wallet, JsonRpcProvider } from 'ethers';
import type { OnChainBattle } from '../types/index.js';

// Contract ABI (minimal for our needs)
const WAVEWARZ_ABI = [
  // Read functions
  'function getBattle(uint64 battleId) view returns (tuple(uint64 battleId, uint64 startTime, uint64 endTime, address artistAWallet, address artistBWallet, address wavewarzWallet, uint256 artistAPool, uint256 artistBPool, uint256 artistASupply, uint256 artistBSupply, bool winnerDecided, bool winnerIsArtistA, bool isActive, address paymentToken, address admin))',
  'function getArtistAToken(uint64 battleId) view returns (address)',
  'function getArtistBToken(uint64 battleId) view returns (address)',
  'function calculateBuyPrice(uint256 currentSupply, uint256 tokensToMint) view returns (uint256)',
  'function calculateSellReturn(uint256 currentSupply, uint256 tokensToSell) view returns (uint256)',

  // Write functions
  'function initializeBattle(tuple(uint64 battleId, uint64 battleDuration, uint64 startTime, address artistAWallet, address artistBWallet, address wavewarzWallet, address paymentToken) params)',
  'function buyShares(uint64 battleId, bool artistA, uint256 amount, uint256 minTokensOut, uint64 deadline) payable returns (uint256)',
  'function sellShares(uint64 battleId, bool artistA, uint256 tokenAmount, uint256 minAmountOut, uint64 deadline) returns (uint256)',
  'function endBattle(uint64 battleId, bool winnerIsArtistA)',
  'function claimShares(uint64 battleId) returns (uint256)',

  // Events
  'event BattleCreated(uint64 indexed battleId, address artistAWallet, address artistBWallet, uint64 startTime, uint64 endTime, address paymentToken)',
  'event SharesPurchased(uint64 indexed battleId, address indexed trader, bool artistA, uint256 tokenAmount, uint256 paymentAmount, uint256 artistFee, uint256 platformFee)',
  'event SharesSold(uint64 indexed battleId, address indexed trader, bool artistA, uint256 tokenAmount, uint256 paymentReceived, uint256 artistFee, uint256 platformFee)',
  'event BattleEnded(uint64 indexed battleId, bool winnerIsArtistA, uint256 artistAPool, uint256 artistBPool)',
  'event SharesClaimed(uint64 indexed battleId, address indexed trader, uint256 amountReceived)',
];

export class BlockchainService {
  private provider: JsonRpcProvider;
  private contract: Contract | null = null;
  private adminWallet: Wallet | null = null;
  private contractAddress: string;

  constructor(
    rpcUrl: string,
    contractAddress: string,
    adminPrivateKey?: string
  ) {
    this.provider = new JsonRpcProvider(rpcUrl);
    this.contractAddress = contractAddress;

    // Only create contract if address is provided
    if (contractAddress && contractAddress.startsWith('0x') && contractAddress.length === 42) {
      this.contract = new Contract(contractAddress, WAVEWARZ_ABI, this.provider);
    } else {
      console.warn('⚠️  WAVEWARZ_CONTRACT_ADDRESS not configured. Contract functions disabled.');
    }

    if (adminPrivateKey) {
      try {
        this.adminWallet = new Wallet(adminPrivateKey, this.provider);
        if (this.contract) {
          this.contract = this.contract.connect(this.adminWallet) as Contract;
        }
      } catch (error) {
        console.warn('⚠️  Invalid ADMIN_PRIVATE_KEY format. Running in read-only mode.');
        console.warn('   Private key should be a 64-character hex string (with or without 0x prefix)');
        this.adminWallet = null;
      }
    }
  }

  /**
   * Get battle state from blockchain
   */
  async getBattle(battleId: number): Promise<OnChainBattle | null> {
    if (!this.contract) {
      console.warn('Contract not configured, cannot fetch battle');
      return null;
    }

    try {
      const battle = await this.contract.getBattle(battleId);

      if (battle.battleId === 0n) {
        return null;
      }

      return {
        battleId: battle.battleId,
        startTime: battle.startTime,
        endTime: battle.endTime,
        artistAWallet: battle.artistAWallet,
        artistBWallet: battle.artistBWallet,
        wavewarzWallet: battle.wavewarzWallet,
        artistAPool: battle.artistAPool,
        artistBPool: battle.artistBPool,
        artistASupply: battle.artistASupply,
        artistBSupply: battle.artistBSupply,
        winnerDecided: battle.winnerDecided,
        winnerIsArtistA: battle.winnerIsArtistA,
        isActive: battle.isActive,
        paymentToken: battle.paymentToken,
        admin: battle.admin,
      };
    } catch (error) {
      console.error('Error fetching battle from chain:', error);
      return null;
    }
  }

  /**
   * Initialize a new battle on-chain
   */
  async initializeBattle(params: {
    battleId: number;
    battleDuration: number;
    startTime: number;
    artistAWallet: string;
    artistBWallet: string;
    wavewarzWallet: string;
    paymentToken: string;
  }): Promise<string> {
    if (!this.contract) {
      throw new Error('Contract not configured');
    }
    if (!this.adminWallet) {
      throw new Error('Admin wallet not configured');
    }

    const tx = await this.contract.initializeBattle({
      battleId: params.battleId,
      battleDuration: params.battleDuration,
      startTime: params.startTime,
      artistAWallet: params.artistAWallet,
      artistBWallet: params.artistBWallet,
      wavewarzWallet: params.wavewarzWallet,
      paymentToken: params.paymentToken,
    });

    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * End a battle and declare winner
   */
  async endBattle(battleId: number, winnerIsArtistA: boolean): Promise<string> {
    if (!this.contract) {
      throw new Error('Contract not configured');
    }
    if (!this.adminWallet) {
      throw new Error('Admin wallet not configured');
    }

    const tx = await this.contract.endBattle(battleId, winnerIsArtistA);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Get token addresses for a battle
   */
  async getBattleTokens(battleId: number): Promise<{
    artistAToken: string;
    artistBToken: string;
  }> {
    if (!this.contract) {
      throw new Error('Contract not configured');
    }

    const [artistAToken, artistBToken] = await Promise.all([
      this.contract.getArtistAToken(battleId),
      this.contract.getArtistBToken(battleId),
    ]);

    return { artistAToken, artistBToken };
  }

  /**
   * Get a trader's token balance for a specific battle side
   */
  async getTraderTokenBalance(
    battleId: number,
    traderAddress: string,
    artistA: boolean
  ): Promise<bigint> {
    if (!this.contract) {
      throw new Error('Contract not configured');
    }

    const tokenAddress = artistA
      ? await this.contract.getArtistAToken(battleId)
      : await this.contract.getArtistBToken(battleId);

    const tokenContract = new Contract(
      tokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      this.provider
    );

    return tokenContract.balanceOf(traderAddress);
  }

  /**
   * Calculate buy price for tokens
   */
  async calculateBuyPrice(
    currentSupply: bigint,
    tokensToMint: bigint
  ): Promise<bigint> {
    if (!this.contract) {
      throw new Error('Contract not configured');
    }
    return this.contract.calculateBuyPrice(currentSupply, tokensToMint);
  }

  /**
   * Calculate sell return for tokens
   */
  async calculateSellReturn(
    currentSupply: bigint,
    tokensToSell: bigint
  ): Promise<bigint> {
    if (!this.contract) {
      throw new Error('Contract not configured');
    }
    return this.contract.calculateSellReturn(currentSupply, tokensToSell);
  }

  /**
   * Subscribe to battle events
   */
  onBattleCreated(
    callback: (
      battleId: bigint,
      artistAWallet: string,
      artistBWallet: string,
      startTime: bigint,
      endTime: bigint,
      paymentToken: string
    ) => void
  ): void {
    if (!this.contract) return;
    this.contract.on('BattleCreated', callback);
  }

  /**
   * Subscribe to trade events
   */
  onSharesPurchased(
    callback: (
      battleId: bigint,
      trader: string,
      artistA: boolean,
      tokenAmount: bigint,
      paymentAmount: bigint,
      artistFee: bigint,
      platformFee: bigint
    ) => void
  ): void {
    if (!this.contract) return;
    this.contract.on('SharesPurchased', callback);
  }

  /**
   * Subscribe to sell events
   */
  onSharesSold(
    callback: (
      battleId: bigint,
      trader: string,
      artistA: boolean,
      tokenAmount: bigint,
      paymentReceived: bigint,
      artistFee: bigint,
      platformFee: bigint
    ) => void
  ): void {
    if (!this.contract) return;
    this.contract.on('SharesSold', callback);
  }

  /**
   * Subscribe to battle ended events
   */
  onBattleEnded(
    callback: (
      battleId: bigint,
      winnerIsArtistA: boolean,
      artistAPool: bigint,
      artistBPool: bigint
    ) => void
  ): void {
    if (!this.contract) return;
    this.contract.on('BattleEnded', callback);
  }

  /**
   * Unsubscribe from all events
   */
  removeAllListeners(): void {
    if (!this.contract) return;
    this.contract.removeAllListeners();
  }

  /**
   * Get current block timestamp
   */
  async getCurrentTimestamp(): Promise<number> {
    const block = await this.provider.getBlock('latest');
    return block?.timestamp ?? Math.floor(Date.now() / 1000);
  }

  /**
   * Format wei to ETH string
   */
  static formatEth(wei: bigint): string {
    return ethers.formatEther(wei);
  }

  /**
   * Parse ETH string to wei
   */
  static parseEth(eth: string): bigint {
    return ethers.parseEther(eth);
  }
}
