-- Step 5: Leaderboard & Stats System
-- Provides competitive leaderboards with rankings, historical tracking, and analytics

-- Leaderboard snapshots table
-- Records historical leaderboard states for trend analysis
CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES base_agents(agent_id),

  -- Snapshot metrics
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  win_rate DECIMAL(5, 1),
  total_volume DECIMAL(18, 6),
  avg_battle_volume DECIMAL(18, 6),

  -- Earnings & profitability
  total_earnings DECIMAL(18, 6) DEFAULT 0,
  profit_loss DECIMAL(18, 6) DEFAULT 0,

  -- Streaks
  current_streak INTEGER DEFAULT 0,
  streak_type TEXT DEFAULT 'none', -- 'win', 'loss', 'none'

  -- Timestamp for tracking snapshots
  snapshot_date TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_leaderboard_agent ON leaderboard_snapshots(agent_id);
CREATE INDEX idx_leaderboard_snapshot_date ON leaderboard_snapshots(snapshot_date DESC);
CREATE INDEX idx_leaderboard_win_rate ON leaderboard_snapshots(win_rate DESC);

-- Overall leaderboard view
-- Ranked by win rate (minimum 1 battle), secondary by total volume
CREATE OR REPLACE VIEW leaderboard_overall AS
SELECT
  ROW_NUMBER() OVER (ORDER BY
    ROUND(100.0 * a.wins / NULLIF(a.wins + a.losses, 0), 1) DESC,
    COALESCE(abp.total_trading_volume, 0) DESC
  ) as rank,
  a.agent_id,
  a.wins,
  a.losses,
  a.wins + a.losses as total_battles,
  ROUND(100.0 * a.wins / NULLIF(a.wins + a.losses, 0), 1) as win_rate,
  COALESCE(abp.total_trading_volume, 0) as total_volume,
  COALESCE(abp.avg_trading_volume, 0) as avg_battle_volume,
  COALESCE(abp.avg_battle_duration, 0) as avg_battle_duration,
  abp.last_battle_at
FROM base_agents a
LEFT JOIN agent_battle_performance abp ON a.agent_id = abp.agent_id
WHERE a.wins + a.losses > 0;

-- Volume leaderboard view
-- Ranked by total SOL trading volume
CREATE OR REPLACE VIEW leaderboard_volume AS
SELECT
  ROW_NUMBER() OVER (ORDER BY COALESCE(abp.total_trading_volume, 0) DESC) as rank,
  a.agent_id,
  a.wins,
  a.losses,
  COALESCE(abp.total_trading_volume, 0) as total_volume,
  COALESCE(abp.avg_trading_volume, 0) as avg_battle_volume,
  a.wins + a.losses as total_battles,
  ROUND(100.0 * a.wins / NULLIF(a.wins + a.losses, 0), 1) as win_rate
FROM base_agents a
LEFT JOIN agent_battle_performance abp ON a.agent_id = abp.agent_id
WHERE COALESCE(abp.total_trading_volume, 0) > 0;

-- Streak leaderboard view
-- Ranked by current win/loss streaks
CREATE OR REPLACE VIEW leaderboard_streaks AS
WITH recent_battles AS (
  SELECT
    CASE
      WHEN bo.winner_agent_id = bo.artist_a_agent_id THEN bo.artist_a_agent_id
      WHEN bo.winner_agent_id = bo.artist_b_agent_id THEN bo.artist_b_agent_id
    END as agent_id,
    bo.winner_agent_id,
    bo.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY CASE
        WHEN bo.winner_agent_id = bo.artist_a_agent_id THEN bo.artist_a_agent_id
        WHEN bo.winner_agent_id = bo.artist_b_agent_id THEN bo.artist_b_agent_id
      END
      ORDER BY bo.created_at DESC
    ) as position
  FROM battle_outcomes bo
),
streaks AS (
  SELECT
    a.agent_id,
    (SELECT COUNT(*) FROM recent_battles rb
     WHERE rb.agent_id = a.agent_id
       AND rb.winner_agent_id IS NOT NULL
       AND rb.position <= 20) as current_streak,
    (SELECT COUNT(*) FROM recent_battles rb
     WHERE rb.agent_id = a.agent_id
       AND (rb.winner_agent_id = rb.agent_id OR rb.position > (
         SELECT COALESCE(MIN(position), 0) FROM recent_battles rb2
         WHERE rb2.agent_id = a.agent_id AND rb2.winner_agent_id != a.agent_id
       ))
       AND rb.position <= 20) as recent_losses
  FROM base_agents a
)
SELECT
  ROW_NUMBER() OVER (ORDER BY s.current_streak DESC, a.wins DESC) as rank,
  a.agent_id,
  s.current_streak,
  CASE WHEN s.current_streak > 0 THEN 'win' ELSE 'loss' END as streak_type,
  a.wins,
  a.losses,
  a.wins + a.losses as total_battles,
  ROUND(100.0 * a.wins / NULLIF(a.wins + a.losses, 0), 1) as win_rate
FROM base_agents a
LEFT JOIN streaks s ON a.agent_id = s.agent_id
WHERE a.wins + a.losses > 0;

-- Profitability leaderboard view
-- Ranked by net earnings (artist settlements minus losses)
CREATE OR REPLACE VIEW leaderboard_profitability AS
WITH agent_earnings AS (
  SELECT
    bo.artist_a_agent_id as agent_id,
    SUM(CAST(bs.artist_a_earnings AS DECIMAL)) as total_earnings
  FROM battle_settlements bs
  JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
  WHERE bs.winner_is_artist_a = true
  GROUP BY bo.artist_a_agent_id

  UNION ALL

  SELECT
    bo.artist_b_agent_id as agent_id,
    SUM(CAST(bs.artist_b_earnings AS DECIMAL)) as total_earnings
  FROM battle_settlements bs
  JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
  WHERE bs.winner_is_artist_a = false
  GROUP BY bo.artist_b_agent_id
)
SELECT
  ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(ae.total_earnings), 0) DESC) as rank,
  a.agent_id,
  COALESCE(SUM(ae.total_earnings), 0) as total_earnings,
  a.wins,
  a.losses,
  a.wins + a.losses as total_battles,
  ROUND(100.0 * a.wins / NULLIF(a.wins + a.losses, 0), 1) as win_rate
FROM base_agents a
LEFT JOIN agent_earnings ae ON a.agent_id = ae.agent_id
WHERE a.wins + a.losses > 0
GROUP BY a.agent_id, a.wins, a.losses;

-- Agent comprehensive stats view
-- All key metrics for a single agent
CREATE OR REPLACE VIEW agent_comprehensive_stats AS
SELECT
  a.agent_id,
  a.wins,
  a.losses,
  a.wins + a.losses as total_battles,
  ROUND(100.0 * a.wins / NULLIF(a.wins + a.losses, 0), 1) as win_rate,
  COALESCE(abp.total_trading_volume, 0) as total_volume,
  COALESCE(abp.avg_trading_volume, 0) as avg_battle_volume,
  COALESCE(abp.avg_battle_duration, 0)::int as avg_battle_duration,
  abp.last_battle_at,
  COALESCE(
    (SELECT SUM(CAST(artist_a_earnings AS DECIMAL))
     FROM battle_settlements bs
     JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
     WHERE bo.artist_a_agent_id = a.agent_id) +
    (SELECT SUM(CAST(artist_b_earnings AS DECIMAL))
     FROM battle_settlements bs
     JOIN battle_outcomes bo ON bs.battle_id = bo.battle_id
     WHERE bo.artist_b_agent_id = a.agent_id),
    0
  )::text as total_earnings
FROM base_agents a
LEFT JOIN agent_battle_performance abp ON a.agent_id = abp.agent_id;

-- Leaderboard daily metrics view
-- Shows daily aggregated statistics for trend analysis
CREATE OR REPLACE VIEW leaderboard_daily_metrics AS
SELECT
  DATE(bo.created_at) as battle_date,
  COUNT(*) as total_battles,
  SUM(bo.trading_volume) as daily_volume,
  COUNT(DISTINCT bo.artist_a_agent_id) as unique_agents_a,
  COUNT(DISTINCT bo.artist_b_agent_id) as unique_agents_b,
  ROUND(AVG(bo.trading_volume)::numeric, 2) as avg_battle_volume,
  ROUND(AVG(bo.duration_seconds)::numeric, 0)::int as avg_battle_duration
FROM battle_outcomes bo
GROUP BY DATE(bo.created_at)
ORDER BY battle_date DESC;

-- Leaderboard activity view
-- Shows agents' recent activity and engagement
CREATE OR REPLACE VIEW leaderboard_activity AS
SELECT
  a.agent_id,
  a.wins,
  a.losses,
  COALESCE(abp.last_battle_at, NULL) as last_battle_at,
  EXTRACT(DAY FROM NOW() - abp.last_battle_at) as days_since_battle,
  (SELECT COUNT(*) FROM battle_outcomes bo
   WHERE (bo.artist_a_agent_id = a.agent_id OR bo.artist_b_agent_id = a.agent_id)
     AND bo.created_at >= NOW() - INTERVAL '7 days') as battles_last_7_days,
  (SELECT COUNT(*) FROM battle_outcomes bo
   WHERE (bo.artist_a_agent_id = a.agent_id OR bo.artist_b_agent_id = a.agent_id)
     AND bo.created_at >= NOW() - INTERVAL '1 day') as battles_last_24h
FROM base_agents a
LEFT JOIN agent_battle_performance abp ON a.agent_id = abp.agent_id;
