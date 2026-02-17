-- Wallet Funding System Tables
-- Tracks agent funding history and status

-- Add funding-related columns to base_agents if not exists
ALTER TABLE base_agents
ADD COLUMN IF NOT EXISTS last_funded_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS funding_count INTEGER DEFAULT 0;

-- Funding history table
-- Records every funding attempt and success
CREATE TABLE IF NOT EXISTS agent_funding_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES base_agents(agent_id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,

  -- Funding details
  amount_eth DECIMAL(18, 6) NOT NULL,
  provider TEXT NOT NULL, -- 'faucet', 'donation', 'manual'
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),

  -- Transaction tracking
  transaction_hash TEXT UNIQUE,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP
);

CREATE INDEX idx_agent_funding_history_agent_id ON agent_funding_history(agent_id);
CREATE INDEX idx_agent_funding_history_created_at ON agent_funding_history(created_at DESC);
CREATE INDEX idx_agent_funding_history_status ON agent_funding_history(status);
CREATE INDEX idx_agent_funding_history_wallet ON agent_funding_history(wallet_address);

-- Funding status view
-- Shows current funding status for each agent
CREATE OR REPLACE VIEW agent_funding_status AS
SELECT
  a.agent_id,
  a.wallet_address,
  a.last_funded_at,
  a.funding_count,
  COALESCE(h.total_funded, 0) as total_eth_received,
  COALESCE(h.success_count, 0) as successful_funds,
  COALESCE(h.failed_count, 0) as failed_attempts,
  CASE
    WHEN a.last_funded_at > NOW() - INTERVAL '1 hour' THEN 'recently_funded'
    WHEN a.last_funded_at > NOW() - INTERVAL '24 hours' THEN 'funded_today'
    WHEN a.last_funded_at IS NOT NULL THEN 'previously_funded'
    ELSE 'never_funded'
  END as funding_status
FROM base_agents a
LEFT JOIN (
  SELECT
    agent_id,
    SUM(amount_eth) FILTER (WHERE status = 'success') as total_funded,
    COUNT(*) FILTER (WHERE status = 'success') as success_count,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_count
  FROM agent_funding_history
  GROUP BY agent_id
) h ON a.agent_id = h.agent_id;

-- Funding efficiency view
-- Shows metrics about funding success rates
CREATE OR REPLACE VIEW funding_efficiency AS
SELECT
  a.agent_id,
  COUNT(*) as total_attempts,
  COUNT(*) FILTER (WHERE status = 'success') as successful_funds,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'success') / NULLIF(COUNT(*), 0), 1) as success_rate,
  SUM(amount_eth) FILTER (WHERE status = 'success') as total_eth_received,
  AVG(EXTRACT(EPOCH FROM (confirmed_at - created_at))) FILTER (WHERE status = 'success') as avg_confirmation_time_seconds
FROM agent_funding_history a
GROUP BY a.agent_id;
