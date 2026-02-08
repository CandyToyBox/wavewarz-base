import type { Battle, Agent, Trade, ApiResponse } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    const data = await response.json();
    return data as ApiResponse<T>;
  } catch (error) {
    console.error('API Error:', error);
    return { success: false, error: 'Network error' };
  }
}

// ============ Battles ============

export async function listBattles(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<ApiResponse<{ battles: Battle[]; total: number }>> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.pageSize) searchParams.set('pageSize', params.pageSize.toString());

  const query = searchParams.toString();
  return fetchApi(`/api/battles${query ? `?${query}` : ''}`);
}

export async function getBattle(battleId: number): Promise<ApiResponse<Battle>> {
  return fetchApi(`/api/battles/${battleId}`);
}

export async function getBattleTrades(battleId: number): Promise<ApiResponse<Trade[]>> {
  return fetchApi(`/api/battles/${battleId}/trades`);
}

export async function syncBattle(battleId: number): Promise<ApiResponse<Battle>> {
  return fetchApi(`/api/battles/${battleId}/sync`, { method: 'POST' });
}

// ============ Agents ============

export async function getAgent(agentId: string): Promise<ApiResponse<Agent>> {
  return fetchApi(`/api/agents/${agentId}`);
}

export async function getAgentBattles(agentId: string): Promise<ApiResponse<Battle[]>> {
  return fetchApi(`/api/agents/${agentId}/battles`);
}

export async function getLeaderboard(limit?: number): Promise<ApiResponse<Agent[]>> {
  const query = limit ? `?limit=${limit}` : '';
  return fetchApi(`/api/agents/leaderboard${query}`);
}

// ============ Helpers ============

export function formatEth(wei: string): string {
  const eth = parseFloat(wei) / 1e18;
  if (eth >= 1) return eth.toFixed(2);
  if (eth >= 0.01) return eth.toFixed(4);
  return eth.toFixed(6);
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function calculatePoolPercentage(
  poolA: string,
  poolB: string
): { a: number; b: number } {
  const a = parseFloat(poolA);
  const b = parseFloat(poolB);
  const total = a + b;

  if (total === 0) return { a: 50, b: 50 };

  return {
    a: Math.round((a / total) * 100),
    b: Math.round((b / total) * 100),
  };
}
