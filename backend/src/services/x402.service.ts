/**
 * x402 Payment Service
 * Enables AI agents to make autonomous HTTP-based payments on Base
 * Used for paying for services like SUNO API, agent-to-agent transactions
 */

import { ethers } from 'ethers';

// x402 payment details from HTTP 402 response
interface X402PaymentDetails {
  amount: string; // Amount in wei or smallest unit
  recipient: string; // Recipient wallet address
  reference: string; // Payment reference for verification
  currency: 'ETH' | 'USDC';
  network: 'base' | 'base-sepolia';
}

// Payment result
interface X402PaymentResult {
  success: boolean;
  txHash?: string;
  payload?: string; // X-PAYMENT header value
  error?: string;
}

// HTTP response with payment requirement
interface X402Response {
  status: 402;
  headers: {
    'x-payment-required': string; // JSON-encoded payment details
  };
}

class X402Service {
  private provider: ethers.Provider;
  private signers: Map<string, ethers.Signer> = new Map();

  // USDC contract on Base
  private readonly USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

  constructor() {
    const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Register a signer for an agent (called during initialization)
   */
  registerSigner(agentId: string, signer: ethers.Signer): void {
    this.signers.set(agentId, signer);
  }

  /**
   * Parse x402 payment details from HTTP 402 response
   */
  parsePaymentRequirement(response: Response): X402PaymentDetails | null {
    if (response.status !== 402) return null;

    const paymentHeader = response.headers.get('x-payment-required');
    if (!paymentHeader) return null;

    try {
      return JSON.parse(paymentHeader) as X402PaymentDetails;
    } catch {
      console.error('Failed to parse x402 payment details');
      return null;
    }
  }

  /**
   * Execute x402 payment and return payment payload for retry
   */
  async executePayment(
    agentId: string,
    details: X402PaymentDetails
  ): Promise<X402PaymentResult> {
    const signer = this.signers.get(agentId);
    if (!signer) {
      return { success: false, error: `Agent ${agentId} not registered` };
    }

    try {
      let txHash: string;

      if (details.currency === 'ETH') {
        // Direct ETH transfer
        const tx = await signer.sendTransaction({
          to: details.recipient,
          value: BigInt(details.amount),
          data: ethers.hexlify(ethers.toUtf8Bytes(details.reference)),
        });
        await tx.wait();
        txHash = tx.hash;
      } else if (details.currency === 'USDC') {
        // USDC transfer via ERC20
        const usdc = new ethers.Contract(
          this.USDC_ADDRESS,
          ['function transfer(address to, uint256 amount) returns (bool)'],
          signer
        );
        const tx = await usdc.transfer(details.recipient, details.amount);
        await tx.wait();
        txHash = tx.hash;
      } else {
        return { success: false, error: `Unsupported currency: ${details.currency}` };
      }

      // Create payment payload for X-PAYMENT header
      const payload = this.createPaymentPayload(txHash, details);

      return {
        success: true,
        txHash,
        payload,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment failed',
      };
    }
  }

  /**
   * Create X-PAYMENT header payload
   */
  private createPaymentPayload(txHash: string, details: X402PaymentDetails): string {
    const payload = {
      txHash,
      reference: details.reference,
      network: details.network,
      timestamp: Date.now(),
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  /**
   * Fetch with automatic x402 payment handling
   * If service returns 402, automatically pays and retries
   */
  async fetchWithPayment(
    agentId: string,
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    // Initial request
    const response = await fetch(url, options);

    // Check if payment required
    if (response.status !== 402) {
      return response;
    }

    // Parse payment details
    const paymentDetails = this.parsePaymentRequirement(response);
    if (!paymentDetails) {
      throw new Error('Invalid x402 payment requirement');
    }

    // Execute payment
    const paymentResult = await this.executePayment(agentId, paymentDetails);
    if (!paymentResult.success) {
      throw new Error(`Payment failed: ${paymentResult.error}`);
    }

    // Retry with payment header
    const retryOptions: RequestInit = {
      ...options,
      headers: {
        ...options.headers,
        'X-PAYMENT': paymentResult.payload!,
      },
    };

    return fetch(url, retryOptions);
  }

  /**
   * Check if a URL requires x402 payment (without executing)
   */
  async checkPaymentRequired(url: string): Promise<X402PaymentDetails | null> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return this.parsePaymentRequirement(response);
    } catch {
      return null;
    }
  }

  /**
   * Estimate payment cost for a service
   */
  async estimateServiceCost(
    url: string
  ): Promise<{ cost: string; currency: string } | null> {
    const details = await this.checkPaymentRequired(url);
    if (!details) return null;

    return {
      cost: ethers.formatUnits(
        details.amount,
        details.currency === 'USDC' ? 6 : 18
      ),
      currency: details.currency,
    };
  }

  /**
   * Get agent's payment history (for auditing)
   */
  private paymentHistory: Map<string, Array<{
    timestamp: number;
    txHash: string;
    amount: string;
    currency: string;
    recipient: string;
    service: string;
  }>> = new Map();

  recordPayment(
    agentId: string,
    txHash: string,
    amount: string,
    currency: string,
    recipient: string,
    service: string
  ): void {
    const history = this.paymentHistory.get(agentId) || [];
    history.push({
      timestamp: Date.now(),
      txHash,
      amount,
      currency,
      recipient,
      service,
    });
    this.paymentHistory.set(agentId, history);
  }

  getPaymentHistory(agentId: string): Array<{
    timestamp: number;
    txHash: string;
    amount: string;
    currency: string;
    recipient: string;
    service: string;
  }> {
    return this.paymentHistory.get(agentId) || [];
  }

  /**
   * Set spending limits for agents (safety measure)
   */
  private spendingLimits: Map<string, { daily: bigint; perTransaction: bigint }> = new Map();
  private dailySpending: Map<string, { amount: bigint; resetTime: number }> = new Map();

  setSpendingLimits(
    agentId: string,
    dailyLimit: bigint,
    perTransactionLimit: bigint
  ): void {
    this.spendingLimits.set(agentId, {
      daily: dailyLimit,
      perTransaction: perTransactionLimit,
    });
  }

  checkSpendingLimit(agentId: string, amount: bigint): boolean {
    const limits = this.spendingLimits.get(agentId);
    if (!limits) return true; // No limits set

    // Check per-transaction limit
    if (amount > limits.perTransaction) {
      return false;
    }

    // Check daily limit
    const spending = this.dailySpending.get(agentId);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    if (!spending || now > spending.resetTime) {
      // New day, reset spending
      this.dailySpending.set(agentId, {
        amount,
        resetTime: now + dayMs,
      });
      return amount <= limits.daily;
    }

    return spending.amount + amount <= limits.daily;
  }

  updateDailySpending(agentId: string, amount: bigint): void {
    const spending = this.dailySpending.get(agentId);
    if (spending) {
      spending.amount += amount;
    }
  }
}

// Singleton instance
export const x402Service = new X402Service();

export default x402Service;
