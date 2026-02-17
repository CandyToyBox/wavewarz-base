-- Matchmaking Preferences Table
-- Stores agent preferences for battle pairing
CREATE TABLE IF NOT EXISTS matchmaking_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL UNIQUE REFERENCES base_agents(agent_id) ON DELETE CASCADE,

  -- Skill level affects matching (beginner, intermediate, advanced)
  skill_level TEXT DEFAULT 'intermediate' CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),

  -- Preferred fighting strategy
  preferred_strategy TEXT DEFAULT 'any' CHECK (preferred_strategy IN ('aggressive', 'strategic', 'any')),

  -- Duration range preferences (in seconds)
  preferred_duration_range JSONB DEFAULT '{"min": 30, "max": 300}',

  -- Recently battled opponents to avoid immediate rematches
  avoid_agents TEXT[] DEFAULT ARRAY[]::TEXT[],

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_matchmaking_preferences_agent_id ON matchmaking_preferences(agent_id);
CREATE INDEX idx_matchmaking_preferences_skill_level ON matchmaking_preferences(skill_level);

-- Queue Analytics Table
-- Track queue wait times, match quality, and success rates
CREATE TABLE IF NOT EXISTS queue_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES base_agents(agent_id),

  -- Queue timing
  joined_at TIMESTAMP NOT NULL,
  matched_at TIMESTAMP,
  wait_time_seconds INTEGER, -- Time from join to match

  -- Match quality metrics
  match_score DECIMAL(3,2), -- 0-1 quality score
  match_reason TEXT,
  matched_with_agent TEXT REFERENCES base_agents(agent_id),

  -- Battle outcome
  battle_id INTEGER REFERENCES base_battles(battle_id),
  won BOOLEAN, -- True if agent won

  -- Tracking
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_queue_analytics_agent_id ON queue_analytics(agent_id);
CREATE INDEX idx_queue_analytics_created_at ON queue_analytics(created_at DESC);
CREATE INDEX idx_queue_analytics_wait_time ON queue_analytics(wait_time_seconds);

-- Matchmaking Statistics View
-- Shows average wait times, match quality, and win rates
CREATE OR REPLACE VIEW matchmaking_stats AS
SELECT
  agent_id,
  COUNT(*) as total_matches,
  ROUND(AVG(wait_time_seconds)::numeric, 0)::integer as avg_wait_time,
  ROUND(AVG(match_score)::numeric, 2) as avg_match_quality,
  COUNT(*) FILTER (WHERE won = true) as wins,
  COUNT(*) FILTER (WHERE won = false) as losses,
  ROUND(100.0 * COUNT(*) FILTER (WHERE won = true) / NULLIF(COUNT(*), 0), 1) as win_rate
FROM queue_analytics
GROUP BY agent_id;

CREATE INDEX idx_queue_analytics_matched_at ON queue_analytics(matched_at)
WHERE matched_at IS NOT NULL;
