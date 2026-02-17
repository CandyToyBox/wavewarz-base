/**
 * Queue Monitor Service
 * Actively monitors the queue and creates battles with intelligent matchmaking
 */

import { Pool } from 'pg';
import { QueueService, type QueueEntry } from './queue.service.js';
import { MatchmakingService, type MatchmakingScore } from './matchmaking.service.js';

export interface QueueStats {
  totalInQueue: number;
  averageWaitTime: number; // seconds
  oldestQueueEntry: number; // seconds
  matchmakingQuality: number; // 0-1
}

export class QueueMonitorService {
  private pool: Pool;
  private queueService: QueueService;
  private matchmakingService: MatchmakingService;
  private monitoringRunning = false;
  private monitorIntervalMs = 3000; // Check every 3 seconds

  constructor(databaseUrl: string, queueService: QueueService) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
    this.queueService = queueService;
    this.matchmakingService = new MatchmakingService(databaseUrl);
  }

  /**
   * Start monitoring the queue
   */
  async start(): Promise<void> {
    if (this.monitoringRunning) {
      console.warn('Queue Monitor already running');
      return;
    }

    this.monitoringRunning = true;
    console.log('📊 Queue Monitor started');

    // Start monitoring loop
    setInterval(() => this.runMonitoringCycle(), this.monitorIntervalMs);

    // Cleanup old preferences every hour
    setInterval(() => this.matchmakingService.cleanupRecentBattles(), 3600000);
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    this.monitoringRunning = false;
    console.log('📊 Queue Monitor stopped');
  }

  /**
   * Main monitoring cycle
   */
  private async runMonitoringCycle(): Promise<void> {
    if (!this.monitoringRunning) {
      return;
    }

    try {
      // Get current queue status
      const status = await this.queueService.getQueueStatus();

      if (status.entries.length < 2) {
        // Not enough agents to create a match
        return;
      }

      // Try to find and create matches
      await this.findAndCreateMatches(status.entries);
    } catch (error) {
      console.error('Error in queue monitoring cycle:', error);
    }
  }

  /**
   * Find matches for agents in queue and create battles
   */
  private async findAndCreateMatches(entries: QueueEntry[]): Promise<void> {
    if (entries.length < 2) {
      return;
    }

    // Check concurrent battle limit
    const activeBattles = await this.pool.query(
      "SELECT COUNT(*) as count FROM base_battles WHERE status IN ('pending', 'active')"
    );
    const activeBattleCount = parseInt(activeBattles.rows[0].count, 10);
    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_BATTLES || '1', 10);

    if (activeBattleCount >= maxConcurrent) {
      return; // No available battle slots
    }

    // Process queue in order (FIFO - first joined gets priority)
    const sortedEntries = [...entries].sort(
      (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    );

    for (const targetAgent of sortedEntries) {
      // Find available opponents (everyone except target)
      const availableOpponents = sortedEntries.filter((e) => e.agentId !== targetAgent.agentId);

      if (availableOpponents.length === 0) {
        continue;
      }

      // Find best match using matchmaking service
      const matchResult = await this.matchmakingService.findBestMatch(
        targetAgent,
        availableOpponents
      );

      if (!matchResult || matchResult.score.score < 0.3) {
        // No good match found
        continue;
      }

      const opponentAgent = matchResult.match;
      const matchScore = matchResult.score;

      try {
        // Log the match attempt
        await this.logQueueMatch(
          targetAgent.agentId,
          opponentAgent.agentId,
          matchScore
        );

        // Create the battle via queue service
        // This will also remove both agents from queue
        const battleCreated = await this.createBattleForMatch(targetAgent, opponentAgent);

        if (battleCreated) {
          console.log(
            `✅ Battle created: ${targetAgent.agentId} vs ${opponentAgent.agentId} (match score: ${matchScore.score.toFixed(2)})`
          );
          console.log(`   Reason: ${matchScore.reason}`);
        }

        // Only create one battle per cycle to avoid overwhelming the system
        break;
      } catch (error) {
        console.error(`Failed to create battle for ${targetAgent.agentId}:`, error);
      }
    }
  }

  /**
   * Create a battle for matched agents
   */
  private async createBattleForMatch(
    agentA: QueueEntry,
    agentB: QueueEntry
  ): Promise<boolean> {
    try {
      // Use the existing queue service battle creation
      // which handles blockchain initialization
      await this.queueService.createBattle(agentA, agentB);
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to create battle: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Get current queue statistics
   */
  async getQueueStats(): Promise<QueueStats> {
    try {
      const status = await this.queueService.getQueueStatus();

      if (status.entries.length === 0) {
        return {
          totalInQueue: 0,
          averageWaitTime: 0,
          oldestQueueEntry: 0,
          matchmakingQuality: 0,
        };
      }

      const now = new Date();
      const waitTimes = status.entries.map((entry) => {
        return (now.getTime() - new Date(entry.joinedAt).getTime()) / 1000;
      });

      // Get average match quality from recent matches
      const qualityResult = await this.pool.query(
        `SELECT AVG(match_score) as avg_quality
         FROM queue_analytics
         WHERE created_at > NOW() - INTERVAL '1 hour'
         AND match_score IS NOT NULL`
      );

      const avgQuality = qualityResult.rows[0]?.avg_quality || 0;

      return {
        totalInQueue: status.entries.length,
        averageWaitTime: Math.round(
          waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
        ),
        oldestQueueEntry: Math.round(Math.max(...waitTimes)),
        matchmakingQuality: parseFloat(avgQuality) || 0,
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return {
        totalInQueue: 0,
        averageWaitTime: 0,
        oldestQueueEntry: 0,
        matchmakingQuality: 0,
      };
    }
  }

  /**
   * Log a queue match attempt
   */
  private async logQueueMatch(
    agentA_id: string,
    agentB_id: string,
    matchScore: MatchmakingScore
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO queue_analytics (agent_id, joined_at, match_score, match_reason, matched_with_agent)
         SELECT $1, NOW(), $3, $4, $2
         UNION ALL
         SELECT $2, NOW(), $3, $4, $1`,
        [agentA_id, agentB_id, matchScore.score, matchScore.reason]
      );
    } catch (error) {
      // Silently fail - this is just analytics
      console.debug('Failed to log queue match:', error);
    }
  }

  /**
   * Get agent matchmaking stats
   */
  async getAgentMatchStats(agentId: string): Promise<Record<string, any> | null> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM matchmaking_stats WHERE agent_id = $1`,
        [agentId]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting agent match stats:', error);
      return null;
    }
  }

  /**
   * Update agent matchmaking preferences
   */
  async updateAgentPreferences(
    agentId: string,
    skillLevel?: string,
    preferredStrategy?: string
  ): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE matchmaking_preferences
         SET skill_level = COALESCE($2, skill_level),
             preferred_strategy = COALESCE($3, preferred_strategy),
             updated_at = NOW()
         WHERE agent_id = $1`,
        [agentId, skillLevel, preferredStrategy]
      );
    } catch (error) {
      console.error('Error updating agent preferences:', error);
      throw error;
    }
  }

  /**
   * Add an agent to avoid list (for recent battles)
   */
  async addAgentToAvoidList(agentId: string, avoidAgentId: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE matchmaking_preferences
         SET avoid_agents = array_append(avoid_agents, $2)
         WHERE agent_id = $1
         AND NOT avoid_agents @> ARRAY[$2]`,
        [agentId, avoidAgentId]
      );
    } catch (error) {
      console.error('Error updating avoid list:', error);
    }
  }
}
