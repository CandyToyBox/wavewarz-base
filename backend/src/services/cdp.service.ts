/**
 * CDP (Coinbase Developer Platform) Service
 * Manages AI agent wallets using the official Coinbase CDP SDK
 * Enables WAVEX and NOVA to autonomously trade, mint NFTs, and receive payouts
 */

import { CdpClient } from '@coinbase/cdp-sdk';

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

class CdpService {
  private client: CdpClient | null = null;
  private wallets: Map<string, any> = new Map();
  private initialized = false;

  /**
   * Initialize CDP client with credentials
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;
    const walletSecret = process.env.CDP_WALLET_SECRET;

    if (!apiKeyId || !apiKeySecret) {
      console.warn('⚠️  CDP credentials not configured. Using mock wallets for development.');
      this.initialized = true;
      return;
    }

    if (!walletSecret) {
      console.warn('⚠️  CDP_WALLET_SECRET not configured. Using mock wallets for development.');
      console.warn('   Create a wallet secret in CDP Portal: https://portal.cdp.coinbase.com');
      this.initialized = true;
      return;
    }

    try {
      this.client = new CdpClient({
        apiKeyId,
        apiKeySecret,
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
      // Development mode - create mock wallet data
      const mockAddress = `0x${config.agentId.replace(/-/g, '').padEnd(40, '0')}`;
      this.wallets.set(config.agentId, {
        address: mockAddress,
        agentId: config.agentId,
        name: config.name,
        mock: true,
      });
      console.warn(`  ⚠️  ${config.name}: Using mock wallet ${mockAddress}`);
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
        });
        // Find ETH balance
        const ethBalance = balances.find((b: any) => b.token?.symbol === 'ETH');
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
          to,
          value: amount,
        },
      });

      return { txHash: result.transactionHash };
    } catch (error) {
      console.error(`Failed to send ETH from ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Execute contract call from agent wallet
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

      // CDP SDK v1.x: use sendTransaction with encoded calldata
      // For now, using a simplified approach - production would encode properly
      const result = await this.client.evm.sendTransaction({
        address: walletData.address,
        network: 'base-sepolia',
        transaction: {
          to: contractAddress,
          value: value || '0',
          data: '0x', // Would need proper ABI encoding in production
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
      [battleId.toString(), artistA, amount, minTokensOut, deadline.toString()],
      amount
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
      [battleId.toString(), artistA, tokenAmount, minEthOut, deadline.toString()]
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
}

// Singleton instance
export const cdpService = new CdpService();

export default cdpService;
