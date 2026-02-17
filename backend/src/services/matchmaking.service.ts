/**
 * Matchmaking Service
 * Intelligently pairs agents based on multiple factors
 * Considers skill level, battle history, preferences, and availability
 */

import { Pool } from 'pg';
import type { RegisteredAgent } from './agent.service.js';
import type { QueueEntry } from './queue.service.js';

export interface MatchmakingScore {
  agentA_id: string;
  agentB_id: string;
  score: number; // 0-1, higher is better match
  reason: string;
  factors: {
    durationMatch: number; // How well song durations match
    skillBalance: number; // Balanced win rates
    previousHistory: number; // Avoid rematches too soon
    strategyDiversity: number; // Different strategies clash better
  };
}

export interface MatchmakingPreferences {
  agentId: string;
  preferredDurationRange: { min: number; max: number };
  avoidAgents: string[]; // Recently battled opponents
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  preferredStrategy: 'aggressive' | 'strategic' | 'any';
}

export class MatchmakingService {
  private pool: Pool;
  private preferencesCache = new Map<string, MatchmakingPreferences>();

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
  }

  /**
   * Find the best match for an agent in the queue
   */
  async findBestMatch(
    targetAgent: QueueEntry,
    availableAgents: QueueEntry[]
  ): Promise<{ match: QueueEntry; score: MatchmakingScore } | null> {
    if (availableAgents.length === 0) {
      return null;
    }

    // Get preferences for both agents
    const targetPrefs = await this.getPreferences(targetAgent.agentId);
    const scores: MatchmakingScore[] = [];

    for (const candidate of availableAgents) {
      if (candidate.agentId === targetAgent.agentId) {
        continue; // Can't battle yourself
      }

      const candidatePrefs = await this.getPreferences(candidate.agentId);

      // Calculate match score
      const score = await this.calculateMatchScore(
        targetAgent,
        candidate,
        targetPrefs,
        candidatePrefs
      );

      scores.push(score);
    }

    if (scores.length === 0) {
      return null;
    }

    // Sort by score (highest first) and return best match
    scores.sort((a, b) => b.score - a.score);
    const bestScore = scores[0];

    const bestMatch = availableAgents.find((a) => a.agentId === bestScore.agentB_id);
    if (!bestMatch) {
      return null;
    }

    return { match: bestMatch, score: bestScore };
  }

  /**
   * Calculate match quality score between two agents
   */
  private async calculateMatchScore(
    agentA: QueueEntry,
    agentB: QueueEntry,
    prefsA: MatchmakingPreferences,
    prefsB: MatchmakingPreferences
  ): Promise<MatchmakingScore> {
    // Factor 1: Duration compatibility (songs should be similar length)
    const durationDiff = Math.abs(agentA.trackDurationSeconds - agentB.trackDurationSeconds);
    const maxDuration = Math.max(agentA.trackDurationSeconds, agentB.trackDurationSeconds);
    const durationMatch = Math.max(0, 1 - durationDiff / (maxDuration * 0.5));

    // Factor 2: Skill balance (agents of similar skill are more competitive)
    const skillBalance = await this.calculateSkillBalance(agentA.agentId, agentB.agentId);

    // Factor 3: Previous battle history (avoid immediate rematches)
    const previousHistory = await this.calculateHistoryScore(
      agentA.agentId,
      agentB.agentId
    );

    // Factor 4: Strategy diversity (different strategies create interesting battles)
    const strategyDiversity = this.calculateStrategyDiversity(
      prefsA.preferredStrategy,
      prefsB.preferredStrategy
    );

    // Check if agents have opted out of battling each other
    const isBlocked = prefsA.avoidAgents.includes(agentB.agentId) ||
                     prefsB.avoidAgents.includes(agentA.agentId);

    if (isBlocked) {
      return {
        agentA_id: agentA.agentId,
        agentB_id: agentB.agentId,
        score: 0,
        reason: 'Agents have blocked each other or recently battled',
        factors: {
          durationMatch: 0,
          skillBalance: 0,
          previousHistory: 0,
          strategyDiversity: 0,
        },
      };
    }

    // Weighted score calculation
    const score =
      durationMatch * 0.25 +
      skillBalance * 0.35 +
      previousHistory * 0.2 +
      strategyDiversity * 0.2;

    return {
      agentA_id: agentA.agentId,
      agentB_id: agentB.agentId,
      score: Math.min(1, Math.max(0, score)),
      reason: this.getMatchReason(
        durationMatch,
        skillBalance,
        previousHistory,
        strategyDiversity
      ),
      factors: {
        durationMatch,
        skillBalance,
        previousHistory,
        strategyDiversity,
      },
    };
  }

  /**
   * Calculate skill balance score
   * Agents with similar win rates are good matches
   */
  private async calculateSkillBalance(agentA_id: string, agentB_id: string): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT
          COALESCE(a.wins, 0) as wins_a,
          COALESCE(a.losses, 0) as losses_a,
          COALESCE(b.wins, 0) as wins_b,
          COALESCE(b.losses, 0) as losses_b
         FROM base_agents a
         FULL OUTER JOIN base_agents b ON true
         WHERE a.agent_id = $1 AND b.agent_id = $2`,
        [agentA_id, agentB_id]
      );

      if (result.rows.length === 0) {
        return 0.5; // Default neutral score
      }

      const row = result.rows[0];
      const totalA = (row.wins_a || 0) + (row.losses_a || 0);
      const totalB = (row.wins_b || 0) + (row.losses_b || 0);

      if (totalA === 0 || totalB === 0) {
        return 0.5; // New agents get neutral score
      }

      const winRateA = (row.wins_a || 0) / totalA;
      const winRateB = (row.wins_b || 0) / totalB;

      // Score: how close are win rates? (1 = identical, 0 = 100% difference)
      const diff = Math.abs(winRateA - winRateB);
      return 1 - diff;
    } catch (error) {
      console.error('Error calculating skill balance:', error);
      return 0.5;
    }
  }

  /**
   * Calculate history score
   * Penalty for recent rematches, bonus for new matchups
   */
  private async calculateHistoryScore(agentA_id: string, agentB_id: string): Promise<number> {
    try {
      // Check if they recently battled
      const result = await this.pool.query(
        `SELECT COUNT(*) as recent_battles,
                MAX(created_at) as last_battle
         FROM base_battles
         WHERE (
           (artist_a_agent_id = $1 AND artist_b_agent_id = $2) OR
           (artist_a_agent_id = $2 AND artist_b_agent_id = $1)
         )
         AND created_at > NOW() - INTERVAL '24 hours'`,
        [agentA_id, agentB_id]
      );

      if (result.rows.length === 0 || result.rows[0].recent_battles === 0) {
        return 1; // Bonus for first-time matchup
      }

      const recentBattles = parseInt(result.rows[0].recent_battles, 10);

      // Penalty for recent rematches (decreases with time)
      // 3+ battles in 24h = 0.2, 2 battles = 0.4, 1 battle = 0.7
      if (recentBattles >= 3) return 0.2;
      if (recentBattles === 2) return 0.4;
      return 0.7;
    } catch (error) {
      console.error('Error calculating history score:', error);
      return 0.5;
    }
  }

  /**
   * Strategy diversity score
   * Different strategies create more interesting battles
   */
  private calculateStrategyDiversity(
    strategyA: string,
    strategyB: string
  ): number {
    if (strategyA === 'any' || strategyB === 'any') {
      return 0.8; // Flexible agents are good for pairing
    }

    if (strategyA === strategyB) {
      return 0.5; // Same strategy is OK but less interesting
    }

    // Different strategies: aggressive vs strategic is ideal
    if (
      (strategyA === 'aggressive' && strategyB === 'strategic') ||
      (strategyA === 'strategic' && strategyB === 'aggressive')
    ) {
      return 1; // Perfect diversity
    }

    return 0.7; // Other combinations
  }

  /**
   * Get or create agent preferences
   */
  private async getPreferences(agentId: string): Promise<MatchmakingPreferences> {
    // Check cache first
    if (this.preferencesCache.has(agentId)) {
      return this.preferencesCache.get(agentId)!;
    }

    try {
      const result = await this.pool.query(
        `SELECT * FROM matchmaking_preferences WHERE agent_id = $1`,
        [agentId]
      );

      let prefs: MatchmakingPreferences;

      if (result.rows.length > 0) {
        const row = result.rows[0];
        prefs = {
          agentId,
          preferredDurationRange: row.preferred_duration_range,
          avoidAgents: row.avoid_agents || [],
          skillLevel: row.skill_level || 'intermediate',
          preferredStrategy: row.preferred_strategy || 'any',
        };
      } else {
        // Default preferences for new agents
        prefs = {
          agentId,
          preferredDurationRange: { min: 30, max: 300 },
          avoidAgents: [],
          skillLevel: 'intermediate',
          preferredStrategy: 'any',
        };

        // Save defaults
        await this.pool.query(
          `INSERT INTO matchmaking_preferences
           (agent_id, skill_level, preferred_strategy)
           VALUES ($1, $2, $3)
           ON CONFLICT (agent_id) DO NOTHING`,
          [agentId, prefs.skillLevel, prefs.preferredStrategy]
        );
      }

      this.preferencesCache.set(agentId, prefs);
      return prefs;
    } catch (error) {
      console.error('Error getting preferences:', error);
      // Return defaults if query fails
      return {
        agentId,
        preferredDurationRange: { min: 30, max: 300 },
        avoidAgents: [],
        skillLevel: 'intermediate',
        preferredStrategy: 'any',
      };
    }
  }

  /**
   * Generate human-readable match reason
   */
  private getMatchReason(
    durationMatch: number,
    skillBalance: number,
    previousHistory: number,
    strategyDiversity: number
  ): string {
    const reasons: string[] = [];

    if (durationMatch > 0.8) reasons.push('Well-matched song durations');
    if (skillBalance > 0.7) reasons.push('Similar skill levels');
    if (previousHistory > 0.8) reasons.push('New exciting matchup');
    if (strategyDiversity > 0.8) reasons.push('Diverse fighting strategies');

    return reasons.length > 0 ? reasons.join(', ') : 'Acceptable match';
  }

  /**
   * Update agent preferences
   */
  async updatePreferences(
    agentId: string,
    updates: Partial<MatchmakingPreferences>
  ): Promise<void> {
    await this.pool.query(
      `UPDATE matchmaking_preferences
       SET skill_level = COALESCE($2, skill_level),
           preferred_strategy = COALESCE($3, preferred_strategy),
           avoid_agents = COALESCE($4, avoid_agents),
           preferred_duration_range = COALESCE($5, preferred_duration_range)
       WHERE agent_id = $1`,
      [
        agentId,
        updates.skillLevel,
        updates.preferredStrategy,
        updates.avoidAgents ? JSON.stringify(updates.avoidAgents) : null,
        updates.preferredDurationRange
          ? JSON.stringify(updates.preferredDurationRange)
          : null,
      ]
    );

    // Invalidate cache
    this.preferencesCache.delete(agentId);
  }

  /**
   * Clear recent battle avoidance after 24 hours
   */
  async cleanupRecentBattles(): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE matchmaking_preferences
         SET avoid_agents = '[]'::jsonb
         WHERE updated_at < NOW() - INTERVAL '24 hours'
         AND avoid_agents != '[]'::jsonb`
      );
    } catch (error) {
      console.error('Error cleaning up recent battles:', error);
    }
  }
}
