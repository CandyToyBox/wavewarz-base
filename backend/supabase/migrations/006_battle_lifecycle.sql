-- Battle Lifecycle System Tables
-- Tracks battle progression, settlements, and outcomes

-- Add lifecycle columns to base_battles
ALTER TABLE base_battles
ADD COLUMN IF NOT EXISTS artist_a_track_generated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS artist_a_track_id TEXT,
ADD COLUMN IF NOT EXISTS artist_b_track_generated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS artist_b_track_id TEXT,
ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP;

-- Battle settlements table
-- Records all financial settlements from battles
CREATE TABLE IF NOT EXISTS battle_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id INTEGER NOT NULL UNIQUE REFERENCES base_battles(battle_id) ON DELETE CASCADE,

  -- Winner determination
  winner_is_artist_a BOOLEAN NOT NULL,

  -- Pool amounts at settlement
  artist_a_pool DECIMAL(18, 6) NOT NULL,
  artist_b_pool DECIMAL(18, 6) NOT NULL,

  -- Artist earnings (trading fees + settlement bonus)
  artist_a_earnings DECIMAL(18, 6) NOT NULL,
  artist_b_earnings DECIMAL(18, 6) NOT NULL,

  -- Trader distribution (percentages of pools)
  winning_trader_payout DECIMAL(18, 6), -- Winner pool + 40% of loser pool
  losing_trader_refund DECIMAL(18, 6),  -- 50% of loser pool
  platform_fee DECIMAL(18, 6),          -- 3% of loser pool

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  settled_at TIMESTAMP
);

CREATE INDEX idx_battle_settlements_battle_id ON battle_settlements(battle_id);
CREATE INDEX idx_battle_settlements_settled_at ON battle_settlements(settled_at);

-- Battle outcomes table
-- Comprehensive record of each battle for analytics
CREATE TABLE IF NOT EXISTS battle_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id INTEGER NOT NULL UNIQUE REFERENCES base_battles(battle_id) ON DELETE CASCADE,

  -- Participants
  artist_a_agent_id TEXT NOT NULL REFERENCES base_agents(agent_id),
  artist_b_agent_id TEXT NOT NULL REFERENCES base_agents(agent_id),

  -- Winner
  winner_agent_id TEXT NOT NULL REFERENCES base_agents(agent_id),
  win_reason TEXT, -- e.g., 'chart-based', 'on-chain settlement', 'on-chain determination'

  -- Trading metrics
  trading_volume DECIMAL(18, 6) NOT NULL,
  duration_seconds INTEGER NOT NULL,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_battle_outcomes_battle_id ON battle_outcomes(battle_id);
CREATE INDEX idx_battle_outcomes_winner ON battle_outcomes(winner_agent_id);
CREATE INDEX idx_battle_outcomes_created_at ON battle_outcomes(created_at DESC);

-- Battle progress view
-- Shows real-time battle state
CREATE OR REPLACE VIEW battle_progress AS
SELECT
  b.battle_id,
  b.status,
  b.artist_a_agent_id,
  b.artist_b_agent_id,
  b.start_time,
  b.end_time,
  EXTRACT(EPOCH FROM (b.end_time - NOW())) as seconds_remaining,
  b.artist_a_pool,
  b.artist_b_pool,
  CASE
    WHEN b.artist_a_pool > b.artist_b_pool THEN 'artist_a'
    WHEN b.artist_b_pool > b.artist_a_pool THEN 'artist_b'
    ELSE 'tied'
  END as leading_side,
  b.winner_decided,
  b.settled_at,
  CASE
    WHEN b.status = 'settled' THEN 'complete'
    WHEN NOW() < b.start_time THEN 'not_started'
    WHEN NOW() < b.end_time THEN 'active'
    ELSE 'ended_pending_settlement'
  END as phase
FROM base_battles b;

-- Battle performance view
-- Shows how agents performed across battles
CREATE OR REPLACE VIEW agent_battle_performance AS
SELECT
  a.agent_id,
  COUNT(bo.id) as total_battles,
  COUNT(bo.id) FILTER (WHERE bo.winner_agent_id = a.agent_id) as wins,
  COUNT(bo.id) FILTER (WHERE bo.winner_agent_id != a.agent_id) as losses,
  ROUND(100.0 * COUNT(bo.id) FILTER (WHERE bo.winner_agent_id = a.agent_id) / NULLIF(COUNT(bo.id), 0), 1) as win_rate,
  ROUND(AVG(bo.trading_volume)::numeric, 2) as avg_trading_volume,
  SUM(bo.trading_volume) as total_trading_volume,
  ROUND(AVG(bo.duration_seconds)::numeric, 0)::integer as avg_battle_duration,
  MAX(bo.created_at) as last_battle_at
FROM base_agents a
LEFT JOIN battle_outcomes bo ON a.agent_id IN (bo.artist_a_agent_id, bo.artist_b_agent_id)
GROUP BY a.agent_id;

-- Settlement efficiency view
-- Shows financial metrics from settlements
CREATE OR REPLACE VIEW settlement_metrics AS
SELECT
  bs.battle_id,
  bs.winner_is_artist_a,
  bs.artist_a_pool,
  bs.artist_b_pool,
  bs.artist_a_earnings,
  bs.artist_b_earnings,
  (bs.artist_a_pool + bs.artist_b_pool) as total_pool,
  bs.platform_fee,
  ROUND(100.0 * bs.artist_a_earnings / NULLIF(bs.artist_a_pool, 0), 1) as artist_a_roi,
  ROUND(100.0 * bs.artist_b_earnings / NULLIF(bs.artist_b_pool, 0), 1) as artist_b_roi
FROM battle_settlements bs;
