-- Migration: Add battle state columns to base_agents for open registration
-- These columns track whether an agent is currently in an active battle

ALTER TABLE base_agents
  ADD COLUMN IF NOT EXISTS in_active_battle BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS current_battle_id BIGINT;
