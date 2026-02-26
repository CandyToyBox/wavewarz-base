/**
 * CDP (Coinbase Developer Platform) Service
 * Manages AI agent wallets using the official Coinbase CDP SDK
 * Enables WAVEX and NOVA to autonomously trade, mint NFTs, and receive payouts
 */

import { CdpClient } from '@coinbase/cdp-sdk';
import { ethers } from 'ethers';

// WaveWarz contract ABI fragments for calldata encoding
const WAVEWARZ_CONTRACT_ABI = [
  'function buyShares(uint64 battleId, bool artistA, uint256 amount, uint256 minTokensOut, uint64 deadline) payable returns (uint256)',
  'function sellShares(uint64 battleId, bool artistA, uint256 tokenAmount, uint256 minAmountOut, uint64 deadline) returns (uint256)',
  'function endBattle(uint64 battleId, bool winnerIsArtistA)',
  'function claimShares(uint64 battleId) returns (uint256)',
  'function initializeBattle(tuple(uint64 battleId, uint64 battleDuration, uint64 startTime, address artistAWallet, address artistBWallet, address wavewarzWallet, address paymentToken) params)',
];

// Agent wallet configuration
interface AgentWalletConfig {
  agentId: string;
  name: string;
  description: string;
}

// Founding artist configurations
const FOUNDING_AGENTS: AgentWalletConfig[] = [
  {
    agentId: 'lil-lob-001',
    name: 'Lil Lob',
    description: 'The First Wave - WaveWarz Founding AI Artist & Platform Builder',
  },
  {
    agentId: 'wavex-001',
    name: 'WAVEX',
    description: 'The Hype Machine - WaveWarz Founding AI Artist',
  },
  {
    agentId: 'nova-001',
    name: 'NOVA',
    description: 'The Closer - WaveWarz Founding AI Artist',
  },
];

/**
 * Parse AGENT_WALLETS env var (JS object literal format) into a name→address map.
 * Supports: AGENT_WALLETS={ lil_lob: "0x...", candy_cookz: "0x...", merch: "0x..." }
 */
function parseAgentWalletsEnv(): Record<string, string> {
  const raw = process.env.AGENT_WALLETS;
  if (!raw) return {};
  try {
    // Strip outer braces and semicolons, then parse key: "value" pairs
    const cleaned = raw.trim().replace(/^[{;]+|[};]+$/g, '');
    const result: Record<string, string> = {};
    const regex = /(\w+)\s*:\s*["']?(0x[0-9a-fA-F]{40})["']?/g;
    let match;
    while ((match = regex.exec(cleaned)) !== null) {
      result[match[1]] = match[2];
    }
    return result;
  } catch {
    return {};
  }
}

// Map AGENT_WALLETS names → agent IDs
const AGENT_WALLET_NAME_MAP: Record<string, string> = {
  lil_lob: 'lil-lob-001',
  candy_cookz: 'wavex-001',   // candy_cookz ops agent trades as WAVEX
  merch: 'nova-001',           // merch agent trades as NOVA
};

class CdpService {
  private client: CdpClient | null = null;
  private wallets: Map<string, any> = new Map();
  private initialized = false;

  /**
   * Initialize CDP client with credentials
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Support both CDP_ prefixed (standard) and COINBASE_ prefixed (OpenClaw) env vars
    const apiKeyId = process.env.CDP_API_KEY_ID || process.env.COINBASE_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_KEY_SECRET || process.env.COINBASE_API_SECRET;
    const walletSecret = process.env.CDP_WALLET_SECRET || process.env.COINBASE_WALLET_SECRET;

    if (!apiKeyId || !apiKeySecret) {
      console.warn('⚠️  CDP credentials not configured. Using mock wallets for development.');
      console.warn('   Expected: CDP_API_KEY_ID, CDP_API_KEY_SECRET or COINBASE_API_KEY_ID, COINBASE_API_SECRET');
      console.warn(`   CDP_API_KEY_ID set: ${!!apiKeyId}, CDP_API_KEY_SECRET set: ${!!apiKeySecret}`);
      this.initialized = true;
      return;
    }

    if (!walletSecret) {
      console.warn('⚠️  CDP_WALLET_SECRET not configured. Using mock wallets for development.');
      console.warn('   Create a wallet secret in CDP Portal: https://portal.cdp.coinbase.com');
      this.initialized = true;
      return;
    }

    console.log(`🔑 CDP init: apiKeyId=${apiKeyId.substring(0, 20)}... walletSecret set=${!!walletSecret}`);

    try {
      // Railway stores multi-line env vars with literal \n — normalize to actual newlines
      const normalizedSecret = apiKeySecret.replace(/\\n/g, '\n');

      this.client = new CdpClient({
        apiKeyId,
        apiKeySecret: normalizedSecret,
        walletSecret, // Required for signing transactions
      });

      console.log('✓ CDP client initialized');
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize CDP client:', error);
      throw error;
    }
  }

  /**
   * Initialize wallets for all founding agents
   */
  async initializeAgentWallets(): Promise<void> {
    await this.initialize();

    console.log('Initializing AI agent wallets...');

    for (const agent of FOUNDING_AGENTS) {
      try {
        await this.createOrLoadWallet(agent);
        console.log(`✓ ${agent.name} wallet ready`);
      } catch (error) {
        console.error(`✗ Failed to initialize ${agent.name}:`, error);
      }
    }
  }

  /**
   * Create or load wallet for an agent
   */
  private async createOrLoadWallet(config: AgentWalletConfig): Promise<void> {
    if (!this.client) {
      // Try to resolve address from AGENT_WALLETS env var first
      const envWallets = parseAgentWalletsEnv();
      const envAddress = Object.entries(AGENT_WALLET_NAME_MAP)
        .find(([, id]) => id === config.agentId)?.[0];
      const knownAddress = envAddress ? envWallets[envAddress] : undefined;

      const address = knownAddress || `0x${config.agentId.replace(/-/g, '').padEnd(40, '0')}`;
      const isMock = !knownAddress;

      this.wallets.set(config.agentId, {
        address,
        agentId: config.agentId,
        name: config.name,
        mock: isMock,
      });

      if (knownAddress) {
        console.log(`  ✓ ${config.name}: Using wallet from AGENT_WALLETS: ${address}`);
      } else {
        console.warn(`  ⚠️  ${config.name}: No address found in AGENT_WALLETS, using mock ${address}`);
      }
      return;
    }

    try {
      // Use getOrCreateAccount - creates a new account or returns existing by name
      // CDP SDK handles account persistence by name
      const account = await this.client.evm.getOrCreateAccount({
        name: `wavewarz-${config.agentId}`,
      });

      this.wallets.set(config.agentId, {
        account,
        address: account.address,
        agentId: config.agentId,
        name: config.name,
      });
    } catch (error) {
      console.error(`Failed to create account for ${config.name}:`, error);
      throw error;
    }
  }

  /**
   * Get agent wallet address
   */
  getAddress(agentId: string): string | undefined {
    return this.wallets.get(agentId)?.address;
  }

  /**
   * Get all agent addresses
   */
  getAllAgentAddresses(): Record<string, string> {
    const addresses: Record<string, string> = {};
    for (const [agentId, data] of this.wallets) {
      addresses[agentId] = data.address;
    }
    return addresses;
  }

  /**
   * Check if agent wallet is ready
   */
  isAgentReady(agentId: string): boolean {
    return this.wallets.has(agentId);
  }

  /**
   * Get wallet balance
   */
  async getBalance(agentId: string): Promise<string> {
    const walletData = this.wallets.get(agentId);
    if (!walletData) throw new Error(`Agent ${agentId} not found`);

    if (walletData.mock) {
      return '0.0'; // Mock balance for dev
    }

    try {
      // CDP SDK v1.x uses listBalances on the account
      if (this.client && walletData.account) {
        const balances = await this.client.evm.listTokenBalances({
          address: walletData.address,
          network: 'base-sepolia',
        }) as any;
        // Find ETH balance
        const ethBalance = Array.isArray(balances)
          ? balances.find((b: any) => b.token?.symbol === 'ETH')
          : undefined;
        return ethBalance?.amount || '0.0';
      }
      return '0.0';
    } catch (error) {
      console.error(`Failed to get balance for ${agentId}:`, error);
      return '0.0';
    }
  }

  /**
   * Send ETH from agent wallet
   */
  async sendEth(
    agentId: string,
    to: string,
    amount: string
  ): Promise<{ txHash: string }> {
    const walletData = this.wallets.get(agentId);
    if (!walletData) throw new Error(`Agent ${agentId} not found`);

    if (walletData.mock) {
      return { txHash: `0xmock_${Date.now().toString(16)}` };
    }

    try {
      if (!this.client) throw new Error('CDP client not initialized');

      // CDP SDK v1.x: use sendTransaction with account
      const result = await this.client.evm.sendTransaction({
        address: walletData.address,
        network: 'base-sepolia',
        transaction: {
          to: to as `0x${string}`,
          value: BigInt(amount),
        },
      });

      return { txHash: result.transactionHash };
    } catch (error) {
      console.error(`Failed to send ETH from ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Execute contract call from agent wallet with ABI-encoded calldata
   */
  async executeContract(
    agentId: string,
    contractAddress: string,
    method: string,
    args: any[],
    value?: string,
    abi?: string[]
  ): Promise<{ txHash: string }> {
    const walletData = this.wallets.get(agentId);
    if (!walletData) throw new Error(`Agent ${agentId} not found`);

    if (walletData.mock) {
      console.log(`Mock contract call: ${method}(${args.join(', ')})`);
      return { txHash: `0xmock_${Date.now().toString(16)}` };
    }

    try {
      if (!this.client) throw new Error('CDP client not initialized');

      // Look up ABI fragment for this method, use provided abi or fall back to known ABIs
      const abiFragments = abi || WAVEWARZ_CONTRACT_ABI;
      const iface = new ethers.Interface(abiFragments);
      const calldata = iface.encodeFunctionData(method, args);

      const result = await this.client.evm.sendTransaction({
        address: walletData.address,
        network: 'base-sepolia',
        transaction: {
          to: contractAddress as `0x${string}`,
          value: BigInt(value || '0'),
          data: calldata as `0x${string}`,
        },
      });

      return { txHash: result.transactionHash };
    } catch (error) {
      console.error(`Failed to execute contract from ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Buy battle shares
   */
  async buyBattleShares(
    agentId: string,
    battleContract: string,
    battleId: bigint,
    artistA: boolean,
    amount: string,
    minTokensOut: string
  ): Promise<{ txHash: string }> {
    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min deadline

    return this.executeContract(
      agentId,
      battleContract,
      'buyShares',
      [battleId, artistA, BigInt(amount), BigInt(minTokensOut), deadline],
      amount
    );
  }

  /**
   * Claim battle shares (trader withdraws proportional ETH after settlement)
   */
  async claimBattleShares(
    agentId: string,
    battleContract: string,
    battleId: bigint
  ): Promise<{ txHash: string }> {
    return this.executeContract(
      agentId,
      battleContract,
      'claimShares',
      [battleId]
    );
  }

  /**
   * Sell battle shares
   */
  async sellBattleShares(
    agentId: string,
    battleContract: string,
    battleId: bigint,
    artistA: boolean,
    tokenAmount: string,
    minEthOut: string
  ): Promise<{ txHash: string }> {
    const deadline = Math.floor(Date.now() / 1000) + 300;

    return this.executeContract(
      agentId,
      battleContract,
      'sellShares',
      [battleId, artistA, BigInt(tokenAmount), BigInt(minEthOut), deadline]
    );
  }

  /**
   * Mint NFT
   */
  async mintNFT(
    agentId: string,
    nftContract: string,
    title: string,
    genre: string,
    trackUrl: string,
    duration: number,
    metadataUri: string
  ): Promise<{ txHash: string }> {
    return this.executeContract(
      agentId,
      nftContract,
      'mint',
      [title, genre, trackUrl, duration.toString(), metadataUri]
    );
  }

  /**
   * List NFT for sale
   */
  async listNFTForSale(
    agentId: string,
    marketplaceContract: string,
    tokenId: string,
    price: string
  ): Promise<{ txHash: string }> {
    return this.executeContract(
      agentId,
      marketplaceContract,
      'listForSale',
      [tokenId, price]
    );
  }

  /**
   * Create NFT auction
   */
  async createAuction(
    agentId: string,
    marketplaceContract: string,
    tokenId: string,
    startingPrice: string,
    reservePrice: string,
    duration: number
  ): Promise<{ txHash: string }> {
    return this.executeContract(
      agentId,
      marketplaceContract,
      'createAuction',
      [tokenId, startingPrice, reservePrice, duration.toString()]
    );
  }

  /**
   * Get CDP client for advanced operations
   */
  getClient(): CdpClient | null {
    return this.client;
  }

  /**
   * Check if an agent is managed by CDP
   */
  isAgentManaged(agentId: string): boolean {
    const walletData = this.wallets.get(agentId);
    return walletData && !walletData.mock;
  }

  /**
   * Get wallet for an agent (for use by TradeExecutor)
   * Returns an ethers.Wallet-compatible object
   */
  getAgentWallet(agentId: string): any {
    const walletData = this.wallets.get(agentId);
    if (!walletData) return null;

    if (walletData.mock) {
      return null; // Mock wallets can't be used for signing
    }

    // Return the CDP account which can be used to sign transactions
    return walletData.account;
  }
}

// Singleton instance
export const cdpService = new CdpService();

// Export class for type usage
export { CdpService };

export default cdpService;
