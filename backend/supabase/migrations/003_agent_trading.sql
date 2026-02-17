-- Agent Trades Table
-- Tracks all trades executed by agents
CREATE TABLE IF NOT EXISTS agent_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id INTEGER NOT NULL REFERENCES base_battles(battle_id),
  agent_id TEXT NOT NULL REFERENCES base_agents(agent_id),
  trade_type TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')),
  target_side CHAR(1) NOT NULL CHECK (target_side IN ('A', 'B')),
  amount TEXT NOT NULL, -- Amount in wei
  tx_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (battle_id) REFERENCES base_battles(battle_id)
);

CREATE INDEX idx_agent_trades_battle_id ON agent_trades(battle_id);
CREATE INDEX idx_agent_trades_agent_id ON agent_trades(agent_id);
CREATE INDEX idx_agent_trades_created_at ON agent_trades(created_at DESC);

-- Agent Trade Decisions Table
-- Logs the decision-making process for auditing
CREATE TABLE IF NOT EXISTS agent_trade_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell', 'hold')),
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (battle_id) REFERENCES base_battles(battle_id),
  FOREIGN KEY (agent_id) REFERENCES base_agents(agent_id),
  UNIQUE (battle_id, agent_id, created_at)
);

CREATE INDEX idx_agent_trade_decisions_battle_id ON agent_trade_decisions(battle_id);
CREATE INDEX idx_agent_trade_decisions_agent_id ON agent_trade_decisions(agent_id);
CREATE INDEX idx_agent_trade_decisions_created_at ON agent_trade_decisions(created_at DESC);

-- Agent Battle Performance Table
-- Tracks agent performance metrics per battle
CREATE TABLE IF NOT EXISTS agent_battle_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  total_buys INTEGER DEFAULT 0,
  total_sells INTEGER DEFAULT 0,
  total_buy_volume TEXT DEFAULT '0', -- In wei
  total_sell_volume TEXT DEFAULT '0', -- In wei
  final_tokens_held TEXT DEFAULT '0',
  final_balance TEXT DEFAULT '0', -- In wei
  win BOOLEAN DEFAULT NULL, -- NULL if battle not settled
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (battle_id, agent_id),
  FOREIGN KEY (battle_id) REFERENCES base_battles(battle_id),
  FOREIGN KEY (agent_id) REFERENCES base_agents(agent_id)
);

CREATE INDEX idx_agent_battle_performance_agent_id ON agent_battle_performance(agent_id);
CREATE INDEX idx_agent_battle_performance_battle_id ON agent_battle_performance(battle_id);
