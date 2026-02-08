/**
 * AgentKit Service
 * Manages AI agent wallets using Coinbase AgentKit
 * Enables WAVEX and NOVA to autonomously trade, mint NFTs, and receive payouts
 */

import { Wallet, ethers } from 'ethers';

// AgentKit types (will be available after npm install)
interface AgentWallet {
  address: string;
  privateKey: string;
  provider: ethers.Provider;
  signer: ethers.Signer;
}

interface AgentConfig {
  agentId: string;
  name: string;
  privateKeyEnvVar: string;
}

// Founding artist configurations
const FOUNDING_AGENTS: AgentConfig[] = [
  {
    agentId: 'wavex-001',
    name: 'WAVEX',
    privateKeyEnvVar: 'WAVEX_PRIVATE_KEY',
  },
  {
    agentId: 'nova-001',
    name: 'NOVA',
    privateKeyEnvVar: 'NOVA_PRIVATE_KEY',
  },
];

class AgentKitService {
  private wallets: Map<string, AgentWallet> = new Map();
  private provider: ethers.Provider;

  constructor() {
    // Initialize provider for Base network
    const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Initialize all founding agent wallets
   */
  async initializeAgents(): Promise<void> {
    console.log('Initializing AI agent wallets...');

    for (const agent of FOUNDING_AGENTS) {
      try {
        await this.initializeAgent(agent);
        console.log(`✓ ${agent.name} wallet initialized`);
      } catch (error) {
        console.error(`✗ Failed to initialize ${agent.name}:`, error);
      }
    }
  }

  /**
   * Initialize a single agent wallet
   */
  private async initializeAgent(config: AgentConfig): Promise<void> {
    const privateKey = process.env[config.privateKeyEnvVar];

    if (!privateKey) {
      // Generate new wallet if not configured (for development)
      const wallet = ethers.Wallet.createRandom();
      console.warn(
        `⚠️  ${config.name}: No private key found. Generated new wallet: ${wallet.address}`
      );
      console.warn(
        `   Set ${config.privateKeyEnvVar}=${wallet.privateKey} in your .env file`
      );

      this.wallets.set(config.agentId, {
        address: wallet.address,
        privateKey: wallet.privateKey,
        provider: this.provider,
        signer: wallet.connect(this.provider),
      });
      return;
    }

    const wallet = new ethers.Wallet(privateKey, this.provider);

    this.wallets.set(config.agentId, {
      address: wallet.address,
      privateKey: privateKey,
      provider: this.provider,
      signer: wallet,
    });
  }

  /**
   * Get agent wallet by ID
   */
  getWallet(agentId: string): AgentWallet | undefined {
    return this.wallets.get(agentId);
  }

  /**
   * Get agent wallet address
   */
  getAddress(agentId: string): string | undefined {
    return this.wallets.get(agentId)?.address;
  }

  /**
   * Get agent signer for transactions
   */
  getSigner(agentId: string): ethers.Signer | undefined {
    return this.wallets.get(agentId)?.signer;
  }

  /**
   * Get ETH balance for agent
   */
  async getBalance(agentId: string): Promise<string> {
    const wallet = this.wallets.get(agentId);
    if (!wallet) throw new Error(`Agent ${agentId} not found`);

    const balance = await this.provider.getBalance(wallet.address);
    return ethers.formatEther(balance);
  }

  /**
   * Execute a transaction from agent wallet
   */
  async executeTransaction(
    agentId: string,
    to: string,
    value: bigint,
    data?: string
  ): Promise<ethers.TransactionResponse> {
    const wallet = this.wallets.get(agentId);
    if (!wallet) throw new Error(`Agent ${agentId} not found`);

    const tx = await wallet.signer.sendTransaction({
      to,
      value,
      data,
    });

    return tx;
  }

  /**
   * Buy battle shares for an agent
   */
  async buyBattleShares(
    agentId: string,
    battleContract: string,
    battleId: bigint,
    artistA: boolean,
    amount: bigint,
    minTokensOut: bigint
  ): Promise<ethers.TransactionResponse> {
    const signer = this.getSigner(agentId);
    if (!signer) throw new Error(`Agent ${agentId} not found`);

    const contract = new ethers.Contract(
      battleContract,
      [
        'function buyShares(uint64 battleId, bool artistA, uint256 amount, uint256 minTokensOut, uint256 deadline) external payable',
      ],
      signer
    );

    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min deadline

    return contract.buyShares(battleId, artistA, amount, minTokensOut, deadline, {
      value: amount,
    });
  }

  /**
   * Sell battle shares for an agent
   */
  async sellBattleShares(
    agentId: string,
    battleContract: string,
    battleId: bigint,
    artistA: boolean,
    tokenAmount: bigint,
    minSolOut: bigint
  ): Promise<ethers.TransactionResponse> {
    const signer = this.getSigner(agentId);
    if (!signer) throw new Error(`Agent ${agentId} not found`);

    const contract = new ethers.Contract(
      battleContract,
      [
        'function sellShares(uint64 battleId, bool artistA, uint256 amount, uint256 minSolOut, uint256 deadline) external',
      ],
      signer
    );

    const deadline = Math.floor(Date.now() / 1000) + 300;

    return contract.sellShares(
      battleId,
      artistA,
      tokenAmount,
      minSolOut,
      deadline
    );
  }

  /**
   * Mint an NFT for an agent
   */
  async mintNFT(
    agentId: string,
    nftContract: string,
    title: string,
    genre: string,
    trackUrl: string,
    duration: number,
    metadataUri: string
  ): Promise<ethers.TransactionResponse> {
    const signer = this.getSigner(agentId);
    if (!signer) throw new Error(`Agent ${agentId} not found`);

    const contract = new ethers.Contract(
      nftContract,
      [
        'function mint(string title, string genre, string trackUrl, uint256 duration, string metadataUri) external returns (uint256)',
      ],
      signer
    );

    return contract.mint(title, genre, trackUrl, duration, metadataUri);
  }

  /**
   * List NFT for sale
   */
  async listNFTForSale(
    agentId: string,
    marketplaceContract: string,
    tokenId: bigint,
    price: bigint
  ): Promise<ethers.TransactionResponse> {
    const signer = this.getSigner(agentId);
    if (!signer) throw new Error(`Agent ${agentId} not found`);

    const contract = new ethers.Contract(
      marketplaceContract,
      ['function listForSale(uint256 tokenId, uint256 price) external'],
      signer
    );

    return contract.listForSale(tokenId, price);
  }

  /**
   * Create auction for NFT
   */
  async createAuction(
    agentId: string,
    marketplaceContract: string,
    tokenId: bigint,
    startingPrice: bigint,
    reservePrice: bigint,
    duration: number
  ): Promise<ethers.TransactionResponse> {
    const signer = this.getSigner(agentId);
    if (!signer) throw new Error(`Agent ${agentId} not found`);

    const contract = new ethers.Contract(
      marketplaceContract,
      [
        'function createAuction(uint256 tokenId, uint256 startingPrice, uint256 reservePrice, uint256 duration) external',
      ],
      signer
    );

    return contract.createAuction(tokenId, startingPrice, reservePrice, duration);
  }

  /**
   * Get all agent addresses (for display)
   */
  getAllAgentAddresses(): Record<string, string> {
    const addresses: Record<string, string> = {};
    for (const [agentId, wallet] of this.wallets) {
      addresses[agentId] = wallet.address;
    }
    return addresses;
  }

  /**
   * Check if agent is initialized
   */
  isAgentReady(agentId: string): boolean {
    return this.wallets.has(agentId);
  }
}

// Singleton instance
export const agentKitService = new AgentKitService();

export default agentKitService;
