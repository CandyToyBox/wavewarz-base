-- WaveWarz Base Database Schema
-- Run this in Supabase SQL Editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- BATTLES TABLE
-- ============================================
CREATE TABLE base_battles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    battle_id BIGINT UNIQUE NOT NULL,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'settled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Artists (AI agents)
    artist_a_agent_id TEXT NOT NULL,
    artist_a_wallet TEXT NOT NULL,
    artist_a_track_url TEXT,
    artist_b_agent_id TEXT NOT NULL,
    artist_b_wallet TEXT NOT NULL,
    artist_b_track_url TEXT,

    -- Battle timing
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    payment_token TEXT NOT NULL DEFAULT 'ETH' CHECK (payment_token IN ('ETH', 'USDC')),

    -- Pool data (synced from chain, stored as text for precision)
    artist_a_pool TEXT NOT NULL DEFAULT '0',
    artist_b_pool TEXT NOT NULL DEFAULT '0',
    artist_a_supply TEXT NOT NULL DEFAULT '0',
    artist_b_supply TEXT NOT NULL DEFAULT '0',

    -- Settlement
    winner_decided BOOLEAN NOT NULL DEFAULT FALSE,
    winner_artist_a BOOLEAN,

    -- Indexes
    CONSTRAINT valid_end_time CHECK (end_time > start_time)
);

-- Indexes for common queries
CREATE INDEX idx_battles_status ON base_battles(status);
CREATE INDEX idx_battles_created_at ON base_battles(created_at DESC);
CREATE INDEX idx_battles_artist_a ON base_battles(artist_a_agent_id);
CREATE INDEX idx_battles_artist_b ON base_battles(artist_b_agent_id);
CREATE INDEX idx_battles_start_time ON base_battles(start_time);

-- ============================================
-- TRADES TABLE
-- ============================================
CREATE TABLE base_trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    battle_id BIGINT NOT NULL REFERENCES base_battles(battle_id) ON DELETE CASCADE,

    -- Transaction info
    tx_hash TEXT NOT NULL,
    trader_wallet TEXT NOT NULL,

    -- Trade details
    artist_side TEXT NOT NULL CHECK (artist_side IN ('A', 'B')),
    trade_type TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')),
    token_amount TEXT NOT NULL,
    payment_amount TEXT NOT NULL,

    -- Fees
    artist_fee TEXT NOT NULL,
    platform_fee TEXT NOT NULL,

    -- Timestamp
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for trade queries
CREATE INDEX idx_trades_battle_id ON base_trades(battle_id);
CREATE INDEX idx_trades_trader ON base_trades(trader_wallet);
CREATE INDEX idx_trades_timestamp ON base_trades(timestamp DESC);
CREATE INDEX idx_trades_tx_hash ON base_trades(tx_hash);

-- ============================================
-- AGENTS TABLE
-- ============================================
CREATE TABLE base_agents (
    agent_id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    moltbook_verified BOOLEAN NOT NULL DEFAULT FALSE,

    -- Stats
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    total_volume TEXT NOT NULL DEFAULT '0',

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for wallet lookups
CREATE INDEX idx_agents_wallet ON base_agents(wallet_address);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to increment agent wins
CREATE OR REPLACE FUNCTION increment_agent_wins(p_agent_id TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE base_agents
    SET wins = wins + 1,
        updated_at = NOW()
    WHERE agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment agent losses
CREATE OR REPLACE FUNCTION increment_agent_losses(p_agent_id TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE base_agents
    SET losses = losses + 1,
        updated_at = NOW()
    WHERE agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update agent volume
CREATE OR REPLACE FUNCTION update_agent_volume(p_agent_id TEXT, p_volume TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE base_agents
    SET total_volume = (CAST(total_volume AS NUMERIC) + CAST(p_volume AS NUMERIC))::TEXT,
        updated_at = NOW()
    WHERE agent_id = p_agent_id;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-update battle status based on time
CREATE OR REPLACE FUNCTION update_battle_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Set to active when start_time passes
    IF NEW.status = 'pending' AND NEW.start_time <= NOW() THEN
        NEW.status := 'active';
    END IF;

    -- Set to completed when end_time passes (if not already settled)
    IF NEW.status = 'active' AND NEW.end_time <= NOW() AND NOT NEW.winner_decided THEN
        NEW.status := 'completed';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update status
CREATE TRIGGER battle_status_update
    BEFORE UPDATE ON base_battles
    FOR EACH ROW
    EXECUTE FUNCTION update_battle_status();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE base_battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE base_agents ENABLE ROW LEVEL SECURITY;

-- Battles: Anyone can read, only service role can write
CREATE POLICY "Battles are viewable by everyone"
    ON base_battles FOR SELECT
    USING (true);

CREATE POLICY "Battles are insertable by service role"
    ON base_battles FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Battles are updatable by service role"
    ON base_battles FOR UPDATE
    USING (true);

-- Trades: Anyone can read, only service role can write
CREATE POLICY "Trades are viewable by everyone"
    ON base_trades FOR SELECT
    USING (true);

CREATE POLICY "Trades are insertable by service role"
    ON base_trades FOR INSERT
    WITH CHECK (true);

-- Agents: Anyone can read, only service role can write
CREATE POLICY "Agents are viewable by everyone"
    ON base_agents FOR SELECT
    USING (true);

CREATE POLICY "Agents are insertable by service role"
    ON base_agents FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Agents are updatable by service role"
    ON base_agents FOR UPDATE
    USING (true);

-- ============================================
-- VIEWS
-- ============================================

-- View for active battles with calculated fields
CREATE OR REPLACE VIEW active_battles_view AS
SELECT
    b.*,
    EXTRACT(EPOCH FROM (b.end_time - NOW())) AS seconds_remaining,
    CASE
        WHEN CAST(b.artist_a_pool AS NUMERIC) + CAST(b.artist_b_pool AS NUMERIC) = 0 THEN 50
        ELSE ROUND(CAST(b.artist_a_pool AS NUMERIC) * 100 /
             (CAST(b.artist_a_pool AS NUMERIC) + CAST(b.artist_b_pool AS NUMERIC)), 2)
    END AS artist_a_percentage,
    (SELECT COUNT(*) FROM base_trades t WHERE t.battle_id = b.battle_id) AS trade_count
FROM base_battles b
WHERE b.status IN ('active', 'pending');

-- View for leaderboard
CREATE OR REPLACE VIEW agent_leaderboard AS
SELECT
    agent_id,
    display_name,
    avatar_url,
    wallet_address,
    moltbook_verified,
    wins,
    losses,
    wins + losses AS total_battles,
    CASE
        WHEN wins + losses = 0 THEN 0
        ELSE ROUND(wins * 100.0 / (wins + losses), 2)
    END AS win_rate,
    total_volume
FROM base_agents
ORDER BY wins DESC, win_rate DESC;

-- ============================================
-- NFT TABLE
-- ============================================
CREATE TABLE nfts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_id BIGINT UNIQUE NOT NULL,

    -- NFT metadata
    title TEXT NOT NULL,
    artist_name TEXT NOT NULL,
    artist_wallet TEXT NOT NULL,
    genre TEXT NOT NULL,
    track_url TEXT NOT NULL,
    duration INTEGER NOT NULL,
    battle_id BIGINT,
    metadata_uri TEXT NOT NULL,

    -- Ownership (current owner may differ from artist)
    owner_wallet TEXT,

    -- Timestamps
    minted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for NFT queries
CREATE INDEX idx_nfts_artist ON nfts(artist_wallet);
CREATE INDEX idx_nfts_owner ON nfts(owner_wallet);
CREATE INDEX idx_nfts_genre ON nfts(genre);
CREATE INDEX idx_nfts_battle ON nfts(battle_id);
CREATE INDEX idx_nfts_minted_at ON nfts(minted_at DESC);

-- ============================================
-- MARKETPLACE LISTINGS TABLE
-- ============================================
CREATE TABLE marketplace_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_id BIGINT NOT NULL REFERENCES nfts(token_id) ON DELETE CASCADE,

    -- Listing info
    seller TEXT NOT NULL,
    listing_type TEXT NOT NULL CHECK (listing_type IN ('fixed_price', 'auction')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- Fixed price fields
    price TEXT,

    -- Auction fields
    starting_price TEXT,
    reserve_price TEXT,
    highest_bid TEXT,
    highest_bidder TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    settled BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for marketplace queries
CREATE INDEX idx_listings_token ON marketplace_listings(token_id);
CREATE INDEX idx_listings_seller ON marketplace_listings(seller);
CREATE INDEX idx_listings_type ON marketplace_listings(listing_type);
CREATE INDEX idx_listings_active ON marketplace_listings(is_active);
CREATE INDEX idx_listings_created ON marketplace_listings(created_at DESC);

-- ============================================
-- NFT SALES HISTORY TABLE
-- ============================================
CREATE TABLE nft_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_id BIGINT NOT NULL REFERENCES nfts(token_id),
    tx_hash TEXT NOT NULL,

    -- Sale info
    seller TEXT NOT NULL,
    buyer TEXT NOT NULL,
    sale_type TEXT NOT NULL CHECK (sale_type IN ('fixed_price', 'auction')),
    price TEXT NOT NULL,

    -- Fees
    artist_royalty TEXT NOT NULL,
    platform_fee TEXT NOT NULL,

    -- Timestamp
    sold_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for sales queries
CREATE INDEX idx_sales_token ON nft_sales(token_id);
CREATE INDEX idx_sales_seller ON nft_sales(seller);
CREATE INDEX idx_sales_buyer ON nft_sales(buyer);
CREATE INDEX idx_sales_date ON nft_sales(sold_at DESC);

-- ============================================
-- AUCTION BIDS TABLE
-- ============================================
CREATE TABLE auction_bids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_id BIGINT NOT NULL REFERENCES nfts(token_id),
    listing_id UUID NOT NULL REFERENCES marketplace_listings(id),

    -- Bid info
    bidder TEXT NOT NULL,
    amount TEXT NOT NULL,
    tx_hash TEXT,

    -- Status
    is_winning BOOLEAN NOT NULL DEFAULT FALSE,
    refunded BOOLEAN NOT NULL DEFAULT FALSE,

    -- Timestamp
    bid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for bid queries
CREATE INDEX idx_bids_token ON auction_bids(token_id);
CREATE INDEX idx_bids_listing ON auction_bids(listing_id);
CREATE INDEX idx_bids_bidder ON auction_bids(bidder);
CREATE INDEX idx_bids_winning ON auction_bids(is_winning);

-- ============================================
-- NFT RLS POLICIES
-- ============================================

ALTER TABLE nfts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE nft_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE auction_bids ENABLE ROW LEVEL SECURITY;

-- NFTs: Anyone can read
CREATE POLICY "NFTs are viewable by everyone"
    ON nfts FOR SELECT
    USING (true);

CREATE POLICY "NFTs are insertable by service role"
    ON nfts FOR INSERT
    WITH CHECK (true);

CREATE POLICY "NFTs are updatable by service role"
    ON nfts FOR UPDATE
    USING (true);

-- Marketplace: Anyone can read
CREATE POLICY "Listings are viewable by everyone"
    ON marketplace_listings FOR SELECT
    USING (true);

CREATE POLICY "Listings are insertable by service role"
    ON marketplace_listings FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Listings are updatable by service role"
    ON marketplace_listings FOR UPDATE
    USING (true);

-- Sales: Anyone can read
CREATE POLICY "Sales are viewable by everyone"
    ON nft_sales FOR SELECT
    USING (true);

CREATE POLICY "Sales are insertable by service role"
    ON nft_sales FOR INSERT
    WITH CHECK (true);

-- Bids: Anyone can read
CREATE POLICY "Bids are viewable by everyone"
    ON auction_bids FOR SELECT
    USING (true);

CREATE POLICY "Bids are insertable by service role"
    ON auction_bids FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Bids are updatable by service role"
    ON auction_bids FOR UPDATE
    USING (true);

-- ============================================
-- NFT VIEWS
-- ============================================

-- View for active marketplace listings with NFT details
CREATE OR REPLACE VIEW marketplace_view AS
SELECT
    ml.*,
    n.title,
    n.artist_name,
    n.artist_wallet,
    n.genre,
    n.track_url,
    n.metadata_uri,
    CASE
        WHEN ml.listing_type = 'auction' AND ml.end_time <= NOW() THEN TRUE
        ELSE FALSE
    END AS auction_ended
FROM marketplace_listings ml
JOIN nfts n ON n.token_id = ml.token_id
WHERE ml.is_active = TRUE;

-- View for artist NFT collections
CREATE OR REPLACE VIEW artist_collections AS
SELECT
    n.artist_wallet,
    n.artist_name,
    COUNT(n.token_id) AS nft_count,
    COUNT(CASE WHEN ml.is_active = TRUE THEN 1 END) AS listed_count,
    SUM(CASE WHEN ns.price IS NOT NULL THEN CAST(ns.price AS NUMERIC) ELSE 0 END) AS total_sales_volume
FROM nfts n
LEFT JOIN marketplace_listings ml ON ml.token_id = n.token_id
LEFT JOIN nft_sales ns ON ns.token_id = n.token_id
GROUP BY n.artist_wallet, n.artist_name;

-- ============================================
-- FOUNDING ARTISTS SEED DATA
-- ============================================

-- Insert WaveWarz Founding Artists (WAVEX and NOVA)
INSERT INTO base_agents (agent_id, wallet_address, display_name, avatar_url, moltbook_verified)
VALUES
    ('wavex-001', '0x_WAVEX_WALLET_PLACEHOLDER', 'WAVEX', 'https://wavewarz.com/artists/wavex-avatar.png', true),
    ('nova-001', '0x_NOVA_WALLET_PLACEHOLDER', 'NOVA', 'https://wavewarz.com/artists/nova-avatar.png', true)
ON CONFLICT (agent_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    moltbook_verified = EXCLUDED.moltbook_verified;

-- ============================================
-- SAMPLE DATA (for development)
-- ============================================

-- Uncomment to insert sample data for testing
/*
-- Sample battle between founding artists
INSERT INTO base_battles (
    battle_id, artist_a_agent_id, artist_a_wallet, artist_b_agent_id, artist_b_wallet,
    start_time, end_time, payment_token
)
VALUES (
    1,
    'wavex-001', '0x_WAVEX_WALLET_PLACEHOLDER',
    'nova-001', '0x_NOVA_WALLET_PLACEHOLDER',
    NOW() + INTERVAL '5 minutes',
    NOW() + INTERVAL '25 minutes',
    'ETH'
);
*/
