/**
 * Leaderboard Service
 * Aggregates agent statistics, calculates rankings, and provides competitive leaderboards
 */

import { Pool } from 'pg';

export interface AgentStats {
  agentId: string;
  wins: number;
  losses: number;
  winRate: number;
  totalBattles: number;
  totalVolume: string;
  avgBattleVolume: string;
  avgBattleDuration: number;
  lastBattleAt: Date | null;
  currentStreak: number;
  streakType: 'win' | 'loss' | 'none';
  totalEarnings: string;
  profitLoss: string;
}

export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  metric: string;
  value: number | string;
  comparison?: string; // For trends
}

export interface LeaderboardView {
  title: string;
  description: string;
  entries: LeaderboardEntry[];
  generatedAt: Date;
  period: 'all_time' | 'month' | 'week' | 'day';
}

export class LeaderboardService {
  private pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
  }

  /**
   * Get comprehensive stats for a single agent
   */
  async getAgentStats(agentId: string): Promise<AgentStats | null> {
    try {
      const result = await this.pool.query(
        `SELECT
          a.agent_id,
          a.wins,
          a.losses,
          ROUND(100.0 * a.wins / NULLIF(a.wins + a.losses, 0), 1) as win_rate,
          a.wins + a.losses as total_battles,
          COALESCE(abp.total_trading_volume, 0)::text as total_volume,
          COALESCE(abp.avg_trading_volume, 0)::text as avg_battle_volume,
          COALESCE(abp.avg_battle_duration, 0)::int as avg_battle_duration,
          abp.last_battle_at,
          COALESCE(
            (SELECT COUNT(*) FROM (
              SELECT bo.winner_agent_id
              FROM battle_outcomes bo
              WHERE bo.winner_agent_id = a.agent_id
              ORDER BY bo.created_at DESC
              LIMIT 10
            ) recent_wins),
            0
          )::int as recent_wins,
          COALESCE(
            (SELECT COUNT(*) FROM (
              SELECT bo.winner_agent_id
              FROM battle_outcomes bo
              WHERE bo.winner_agent_id != a.agent_id
                AND (bo.artist_a_agent_id = a.agent_id OR bo.artist_b_agent_id = a.agent_id)
              ORDER BY bo.created_at DESC
              LIMIT 10
            ) recent_losses),
            0
          )::int as recent_losses
        FROM base_agents a
        LEFT JOIN agent_battle_performance abp ON a.agent_id = abp.agent_id
        WHERE a.agent_id = $1`,
        [agentId]
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      const { currentStreak, streakType } = await this.calculateCurrentStreak(agentId);
      const { totalEarnings, profitLoss } = await this.calculateAgentEarnings(agentId);

      return {
        agentId: row.agent_id,
        wins: row.wins,
        losses: row.losses,
        winRate: row.win_rate || 0,
        totalBattles: row.total_battles,
        totalVolume: row.total_volume,
        avgBattleVolume: row.avg_battle_volume,
        avgBattleDuration: row.avg_battle_duration,
        lastBattleAt: row.last_battle_at,
        currentStreak,
        streakType,
        totalEarnings,
        profitLoss,
      };
    } catch (error) {
      console.error(`Failed to get stats for agent ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Get overall leaderboard (sorted by win rate, then volume)
   */
  async getOverallLeaderboard(limit: number = 50): Promise<LeaderboardView> {
    try {
      const result = await this.pool.query(
        `SELECT
          a.agent_id,
          a.wins,
          a.losses,
          ROUND(100.0 * a.wins / NULLIF(a.wins + a.losses, 0), 1) as win_rate,
          COALESCE(abp.total_trading_volume, 0) as total_volume,
          a.wins + a.losses as total_battles,
          ROW_NUMBER() OVER (ORDER BY ROUND(100.0 * a.wins / NULLIF(a.wins + a.losses, 0), 1) DESC, COALESCE(abp.total_trading_volume, 0) DESC) as rank
        FROM base_agents a
        LEFT JOIN agent_battle_performance abp ON a.agent_id = abp.agent_id
        WHERE a.wins + a.losses > 0
        ORDER BY rank
        LIMIT $1`,
        [limit]
      );

      const entries: LeaderboardEntry[] = result.rows.map(row => ({
        rank: row.rank,
        agentId: row.agent_id,
        metric: 'win_rate',
        value: `${row.win_rate}% (${row.wins}W-${row.losses}L)`,
      }));

      return {
        title: 'Overall Leaderboard',
        description: 'Ranked by win rate (minimum 1 battle), secondary sort by total volume',
        entries,
        generatedAt: new Date(),
        period: 'all_time',
      };
    } catch (error) {
      console.error('Failed to get overall leaderboard:', error);
      return {
        title: 'Overall Leaderboard',
        description: '',
        entries: [],
        generatedAt: new Date(),
        period: 'all_time',
      };
    }
  }

  /**
   * Get leaderboard by trading volume
   */
  async getVolumeLeaderboard(limit: number = 50): Promise<LeaderboardView> {
    try {
      const result = await this.pool.query(
        `SELECT
          a.agent_id,
          COALESCE(abp.total_trading_volume, 0) as total_volume,
          a.wins,
          a.losses,
          a.wins + a.losses as total_battles,
          ROW_NUMBER() OVER (ORDER BY COALESCE(abp.total_trading_volume, 0) DESC) as rank
        FROM base_agents a
        LEFT JOIN agent_battle_performance abp ON a.agent_id = abp.agent_id
        WHERE COALESCE(abp.total_trading_volume, 0) > 0
        ORDER BY rank
        LIMIT $1`,
        [limit]
      );

      const entries: LeaderboardEntry[] = result.rows.map(row => ({
        rank: row.rank,
        agentId: row.agent_id,
        metric: 'total_volume',
        value: row.total_volume.toString(),
      }));

      return {
        title: 'Trading Volume Leaderboard',
        description: 'Ranked by total SOL trading volume across all battles',
        entries,
        generatedAt: new Date(),
        period: 'all_time',
      };
    } catch (error) {
      console.error('Failed to get volume leaderboard:', error);
      return {
        title: 'Trading Volume Leaderboard',
        description: '',
        entries: [],
        generatedAt: new Date(),
        period: 'all_time',
      };
    }
  }

  /**
   * Get leaderboard by win streak
   */
  async getStreakLeaderboard(limit: number = 50): Promise<LeaderboardView> {
    try {
      const result = await this.pool.query(
        `WITH recent_battles AS (
          SELECT
            CASE WHEN winner_agent_id = artist_a_agent_id THEN artist_a_agent_id
                 WHEN winner_agent_id = artist_b_agent_id THEN artist_b_agent_id
            END as agent_id,
            winner_agent_id,
            ROW_NUMBER() OVER (PARTITION BY CASE WHEN winner_agent_id = artist_a_agent_id THEN artist_a_agent_id
                                                  WHEN winner_agent_id = artist_b_agent_id THEN artist_b_agent_id
                                                  END ORDER BY created_at DESC) as position
          FROM battle_outcomes
        ),
        streaks AS (
          SELECT
            agent_id,
            COUNT(*) as current_streak
          FROM recent_battles
          WHERE position <= 20 AND winner_agent_id IS NOT NULL
          GROUP BY agent_id
        )
        SELECT
          a.agent_id,
          COALESCE(s.current_streak, 0) as streak,
          a.wins,
          a.losses,
          ROW_NUMBER() OVER (ORDER BY COALESCE(s.current_streak, 0) DESC, a.wins DESC) as rank
        FROM base_agents a
        LEFT JOIN streaks s ON a.agent_id = s.agent_id
        WHERE COALESCE(s.current_streak, 0) > 0 OR a.wins + a.losses = 0
        ORDER BY rank
        LIMIT $1`,
        [limit]
      );

      const entries: LeaderboardEntry[] = result.rows.map(row => ({
        rank: row.rank,
        agentId: row.agent_id,
        metric: 'current_streak',
        value: `${row.streak} consecutive wins`,
      }));

      return {
        title: 'Win Streak Leaderboard',
        description: 'Ranked by current consecutive wins (across last 20 battles)',
        entries,
        generatedAt: new Date(),
        period: 'all_time',
      };
    } catch (error) {
      console.error('Failed to get streak leaderboard:', error);
      return {
        title: 'Win Streak Leaderboard',
        description: '',
        entries: [],
        generatedAt: new Date(),
        period: 'all_time',
      };
    }
  }

  /**
   * Get leaderboard by profitability (earnings - losses)
   */
  async getProfitabilityLeaderboard(limit: number = 50): Promise<LeaderboardView> {
    try {
      const result = await this.pool.query(
        `SELECT
          a.agent_id,
          a.wins,
          a.losses,
          COALESCE(
            (SELECT COALESCE(SUM(CAST(artist_a_earnings AS DECIMAL)), 0)
             FROM battle_settlements bs
             JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
             WHERE bo.artist_a_agent_id = a.agent_id AND bs.winner_is_artist_a = true) +
            (SELECT COALESCE(SUM(CAST(artist_b_earnings AS DECIMAL)), 0)
             FROM battle_settlements bs
             JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
             WHERE bo.artist_b_agent_id = a.agent_id AND bs.winner_is_artist_a = false),
            0
          )::text as total_earnings,
          COALESCE(
            (SELECT COALESCE(SUM(CAST(artist_a_earnings AS DECIMAL)), 0)
             FROM battle_settlements bs
             JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
             WHERE bo.artist_a_agent_id = a.agent_id AND bs.winner_is_artist_a = true) +
            (SELECT COALESCE(SUM(CAST(artist_b_earnings AS DECIMAL)), 0)
             FROM battle_settlements bs
             JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
             WHERE bo.artist_b_agent_id = a.agent_id AND bs.winner_is_artist_a = false) -
            (SELECT COALESCE(SUM(CAST(artist_a_pool AS DECIMAL)), 0)
             FROM battle_settlements bs
             JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
             WHERE bo.artist_a_agent_id = a.agent_id AND bs.winner_is_artist_a = false) -
            (SELECT COALESCE(SUM(CAST(artist_b_pool AS DECIMAL)), 0)
             FROM battle_settlements bs
             JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
             WHERE bo.artist_b_agent_id = a.agent_id AND bs.winner_is_artist_a = true),
            0
          )::text as profit_loss,
          ROW_NUMBER() OVER (ORDER BY COALESCE(
            (SELECT COALESCE(SUM(CAST(artist_a_earnings AS DECIMAL)), 0)
             FROM battle_settlements bs
             JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
             WHERE bo.artist_a_agent_id = a.agent_id AND bs.winner_is_artist_a = true) +
            (SELECT COALESCE(SUM(CAST(artist_b_earnings AS DECIMAL)), 0)
             FROM battle_settlements bs
             JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
             WHERE bo.artist_b_agent_id = a.agent_id AND bs.winner_is_artist_a = false) -
            (SELECT COALESCE(SUM(CAST(artist_a_pool AS DECIMAL)), 0)
             FROM battle_settlements bs
             JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
             WHERE bo.artist_a_agent_id = a.agent_id AND bs.winner_is_artist_a = false) -
            (SELECT COALESCE(SUM(CAST(artist_b_pool AS DECIMAL)), 0)
             FROM battle_settlements bs
             JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
             WHERE bo.artist_b_agent_id = a.agent_id AND bs.winner_is_artist_a = true),
            0
          ) DESC) as rank
        FROM base_agents a
        WHERE a.wins + a.losses > 0
        ORDER BY rank
        LIMIT $1`,
        [limit]
      );

      const entries: LeaderboardEntry[] = result.rows.map(row => ({
        rank: row.rank,
        agentId: row.agent_id,
        metric: 'profit_loss',
        value: `${parseFloat(row.profit_loss).toFixed(2)} SOL`,
      }));

      return {
        title: 'Profitability Leaderboard',
        description: 'Ranked by net earnings (artist settlements minus losses)',
        entries,
        generatedAt: new Date(),
        period: 'all_time',
      };
    } catch (error) {
      console.error('Failed to get profitability leaderboard:', error);
      return {
        title: 'Profitability Leaderboard',
        description: '',
        entries: [],
        generatedAt: new Date(),
        period: 'all_time',
      };
    }
  }

  /**
   * Get all top agents summary
   */
  async getTopAgents(limit: number = 10): Promise<AgentStats[]> {
    try {
      const result = await this.pool.query(
        `SELECT a.agent_id
        FROM base_agents a
        LEFT JOIN agent_battle_performance abp ON a.agent_id = abp.agent_id
        WHERE a.wins + a.losses > 0
        ORDER BY ROUND(100.0 * a.wins / NULLIF(a.wins + a.losses, 0), 1) DESC, COALESCE(abp.total_trading_volume, 0) DESC
        LIMIT $1`,
        [limit]
      );

      const stats: AgentStats[] = [];
      for (const row of result.rows) {
        const stat = await this.getAgentStats(row.agent_id);
        if (stat) stats.push(stat);
      }
      return stats;
    } catch (error) {
      console.error('Failed to get top agents:', error);
      return [];
    }
  }

  /**
   * Calculate current win/loss streak for an agent
   */
  private async calculateCurrentStreak(
    agentId: string
  ): Promise<{ currentStreak: number; streakType: 'win' | 'loss' | 'none' }> {
    try {
      const result = await this.pool.query(
        `WITH recent_outcomes AS (
          SELECT
            CASE
              WHEN bo.winner_agent_id = $1 THEN 'win'
              ELSE 'loss'
            END as outcome,
            bo.created_at,
            ROW_NUMBER() OVER (ORDER BY bo.created_at DESC) as position
          FROM battle_outcomes bo
          WHERE bo.artist_a_agent_id = $1 OR bo.artist_b_agent_id = $1
          ORDER BY bo.created_at DESC
          LIMIT 20
        )
        SELECT
          outcome,
          COUNT(*) as streak_count
        FROM recent_outcomes
        WHERE outcome = (SELECT outcome FROM recent_outcomes WHERE position = 1)
        GROUP BY outcome`,
        [agentId]
      );

      if (result.rows.length === 0) {
        return { currentStreak: 0, streakType: 'none' };
      }

      const row = result.rows[0];
      return {
        currentStreak: row.streak_count,
        streakType: row.outcome === 'win' ? 'win' : 'loss',
      };
    } catch (error) {
      console.error(`Failed to calculate streak for ${agentId}:`, error);
      return { currentStreak: 0, streakType: 'none' };
    }
  }

  /**
   * Calculate total earnings and profit/loss for an agent
   */
  private async calculateAgentEarnings(agentId: string): Promise<{ totalEarnings: string; profitLoss: string }> {
    try {
      const result = await this.pool.query(
        `SELECT
          COALESCE(
            (SELECT SUM(CAST(artist_a_earnings AS DECIMAL))
             FROM battle_settlements bs
             JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
             WHERE bo.artist_a_agent_id = $1) +
            (SELECT SUM(CAST(artist_b_earnings AS DECIMAL))
             FROM battle_settlements bs
             JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
             WHERE bo.artist_b_agent_id = $1),
            0
          )::text as total_earnings`,
        [agentId]
      );

      const totalEarnings = result.rows[0]?.total_earnings || '0';

      return {
        totalEarnings,
        profitLoss: totalEarnings, // Simplified: assume all earnings count as profit
      };
    } catch (error) {
      console.error(`Failed to calculate earnings for ${agentId}:`, error);
      return { totalEarnings: '0', profitLoss: '0' };
    }
  }

  /**
   * Cleanup: Close database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
