-- Migration: Entry-queue cycle for the always-on protocol model
--
-- v1 model: a long-open ENTRY QUEUE (~23h) collects picks (commitments only,
-- nothing on-chain), then ONE short live Quick Battle resolves on the existing
-- WaveWarzBase contract via trading dominance. Distinct from battle_queue
-- (migration 002), which is agent-vs-agent matchmaking, not pick collection.

-- One cycle = one battle slot. v1 runs BATTLES_PER_CYCLE=1.
CREATE TABLE IF NOT EXISTS entry_cycles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- on-chain battle id, assigned when the cycle locks and initializeBattle fires
    battle_id BIGINT UNIQUE,
    -- open -> locked -> live -> settled (or cancelled)
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'locked', 'live', 'settled', 'cancelled')),
    -- songs sourced from Audius into the two sides
    artist_a_track_url TEXT,
    artist_b_track_url TEXT,
    artist_a_wallet TEXT,
    artist_b_wallet TEXT,
    -- queue window
    queue_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    queue_closes_at TIMESTAMPTZ NOT NULL,
    -- live battle window (set when locked)
    battle_started_at TIMESTAMPTZ,
    battle_ends_at TIMESTAMPTZ,
    -- resolution
    winner_is_artist_a BOOLEAN,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one cycle may be open at a time (v1 single-slot invariant).
CREATE UNIQUE INDEX IF NOT EXISTS idx_entry_cycles_one_open
    ON entry_cycles(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_entry_cycles_status ON entry_cycles(status);
CREATE INDEX IF NOT EXISTS idx_entry_cycles_closes_at ON entry_cycles(queue_closes_at);

-- A pick = a COMMITMENT placed during the open window. Stores intent + budget;
-- it is NOT an on-chain buy. Execution happens during the live window, however
-- the actor's strategy chooses (auto at open, trade during, snipe at end).
CREATE TABLE IF NOT EXISTS entry_picks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id UUID NOT NULL REFERENCES entry_cycles(id) ON DELETE CASCADE,
    -- 'agent' (walked up via x402) or 'human' (wallet)
    actor_type TEXT NOT NULL CHECK (actor_type IN ('agent', 'human')),
    -- agentId for agents, wallet address for humans
    actor_id TEXT NOT NULL,
    -- side picked: true = artist A
    side_is_artist_a BOOLEAN NOT NULL,
    -- committed budget ceiling (wei). Live trading may not exceed this.
    max_budget_wei NUMERIC(78, 0) NOT NULL CHECK (max_budget_wei > 0),
    -- who drives execution during the live window:
    -- 'agent' = the actor's agent strategy trades; 'self' = the human trades live
    autonomy TEXT NOT NULL DEFAULT 'agent' CHECK (autonomy IN ('agent', 'self')),
    -- human override: when a human pick controls an agent, that agent stands down
    controls_agent_id TEXT,
    -- x402 settlement proof for agent picks (X-PAYMENT payload / txHash)
    x402_tx_hash TEXT,
    -- set true once a pick's commitment has been deployed on-chain during live
    executed BOOLEAN NOT NULL DEFAULT FALSE,
    placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- one standing pick per actor per cycle; re-pick updates in place
    UNIQUE (cycle_id, actor_type, actor_id)
);

CREATE INDEX IF NOT EXISTS idx_entry_picks_cycle ON entry_picks(cycle_id);
CREATE INDEX IF NOT EXISTS idx_entry_picks_controls ON entry_picks(controls_agent_id)
    WHERE controls_agent_id IS NOT NULL;

-- RLS (service-role writes, public reads) — mirrors battle_queue policy style.
ALTER TABLE entry_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE entry_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entry cycles viewable by everyone"
    ON entry_cycles FOR SELECT USING (true);
CREATE POLICY "Entry cycles writable by service role"
    ON entry_cycles FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Entry picks viewable by everyone"
    ON entry_picks FOR SELECT USING (true);
CREATE POLICY "Entry picks writable by service role"
    ON entry_picks FOR ALL USING (true) WITH CHECK (true);
