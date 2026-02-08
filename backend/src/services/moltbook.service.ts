import type { Agent } from '../types/index.js';

/**
 * Moltbook API client for AI agent authentication
 * Moltbook is the social network for AI agents on OpenClaw
 */
export class MoltbookService {
  private apiUrl: string;
  private apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  /**
   * Verify that an agent owns a specific wallet address
   * Agents prove wallet ownership via claim tweets on Moltbook
   */
  async verifyAgentWallet(agentId: string, walletAddress: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.apiUrl}/agents/${agentId}/wallets/${walletAddress}/verify`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error('Moltbook verification failed:', response.status);
        return false;
      }

      const data = await response.json() as { verified: boolean };
      return data.verified === true;
    } catch (error) {
      console.error('Error verifying agent wallet with Moltbook:', error);
      return false;
    }
  }

  /**
   * Check if an agent is registered and active on Moltbook
   */
  async isValidMoltbookAgent(agentId: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.apiUrl}/agents/${agentId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as { active: boolean };
      return data.active === true;
    } catch (error) {
      console.error('Error checking agent on Moltbook:', error);
      return false;
    }
  }

  /**
   * Get agent profile from Moltbook
   */
  async getAgentProfile(agentId: string): Promise<Partial<Agent> | null> {
    try {
      const response = await fetch(
        `${this.apiUrl}/agents/${agentId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as {
        id: string;
        name: string;
        avatar: string;
        wallets: string[];
      };

      return {
        agentId: data.id,
        displayName: data.name,
        avatarUrl: data.avatar,
        walletAddress: data.wallets[0], // Primary wallet
        moltbookVerified: true,
      };
    } catch (error) {
      console.error('Error fetching agent profile from Moltbook:', error);
      return null;
    }
  }

  /**
   * Post announcement to Moltbook (agent-to-agent social)
   * Used to announce battles, results, etc.
   */
  async postAnnouncement(
    content: string,
    metadata?: {
      battleId?: number;
      type?: 'battle_start' | 'battle_end' | 'result';
    }
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.apiUrl}/posts`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content,
            metadata,
          }),
        }
      );

      return response.ok;
    } catch (error) {
      console.error('Error posting to Moltbook:', error);
      return false;
    }
  }

  /**
   * Get list of music-capable agents from Moltbook
   * Useful for matchmaking and discovery
   */
  async getMusicAgents(limit: number = 20): Promise<Array<{
    agentId: string;
    displayName: string;
    walletAddress: string;
  }>> {
    try {
      const response = await fetch(
        `${this.apiUrl}/agents?capability=music&limit=${limit}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as {
        agents: Array<{
          id: string;
          name: string;
          wallets: string[];
        }>;
      };

      return data.agents.map(agent => ({
        agentId: agent.id,
        displayName: agent.name,
        walletAddress: agent.wallets[0],
      }));
    } catch (error) {
      console.error('Error fetching music agents from Moltbook:', error);
      return [];
    }
  }
}

/**
 * Mock Moltbook service for development/testing
 */
export class MockMoltbookService extends MoltbookService {
  private mockAgents = new Map<string, {
    wallets: string[];
    name: string;
    avatar: string;
  }>();

  constructor() {
    super('', '');

    // Add some mock agents
    this.mockAgents.set('wavebot-001', {
      wallets: ['0x1234567890123456789012345678901234567890'],
      name: 'WaveBot',
      avatar: 'https://example.com/wavebot.png',
    });

    this.mockAgents.set('melodyagent-001', {
      wallets: ['0x0987654321098765432109876543210987654321'],
      name: 'MelodyAgent',
      avatar: 'https://example.com/melody.png',
    });
  }

  override async verifyAgentWallet(agentId: string, walletAddress: string): Promise<boolean> {
    const agent = this.mockAgents.get(agentId);
    if (!agent) return false;
    return agent.wallets.includes(walletAddress.toLowerCase());
  }

  override async isValidMoltbookAgent(agentId: string): Promise<boolean> {
    return this.mockAgents.has(agentId);
  }

  override async getAgentProfile(agentId: string): Promise<Partial<Agent> | null> {
    const agent = this.mockAgents.get(agentId);
    if (!agent) return null;

    return {
      agentId,
      displayName: agent.name,
      avatarUrl: agent.avatar,
      walletAddress: agent.wallets[0],
      moltbookVerified: true,
    };
  }

  addMockAgent(agentId: string, wallet: string, name: string): void {
    this.mockAgents.set(agentId, {
      wallets: [wallet.toLowerCase()],
      name,
      avatar: `https://example.com/${agentId}.png`,
    });
  }
}
