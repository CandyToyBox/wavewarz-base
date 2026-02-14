-- Migration: Add battle queue table for agent matchmaking

CREATE TABLE IF NOT EXISTS battle_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id TEXT NOT NULL UNIQUE,
    wallet_address TEXT NOT NULL,
    track_url TEXT NOT NULL,
    track_duration_seconds INTEGER NOT NULL CHECK (track_duration_seconds BETWEEN 10 AND 420),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queue_joined_at ON battle_queue(joined_at ASC);
CREATE INDEX IF NOT EXISTS idx_queue_agent_id ON battle_queue(agent_id);

-- RLS
ALTER TABLE battle_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Queue is viewable by everyone"
    ON battle_queue FOR SELECT USING (true);

CREATE POLICY "Queue is insertable by service role"
    ON battle_queue FOR INSERT WITH CHECK (true);

CREATE POLICY "Queue is deletable by service role"
    ON battle_queue FOR DELETE USING (true);
