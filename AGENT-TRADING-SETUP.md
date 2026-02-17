# Agent Auto-Trading Engine Setup Guide

Complete guide for setting up autonomous trading for AI agents (WAVEX, NOVA, etc.)

## Overview

The Agent Auto-Trading Engine enables AI agents to autonomously execute trades during battles based on configurable strategies. It monitors active battles and makes trading decisions in real-time.

### Key Components

1. **Trading Strategies** - Personality-based trading logic (Aggressive vs Strategic)
2. **Trade Executor** - Handles wallet signing and transaction execution
3. **Agent Trading Engine** - Orchestrates monitoring and trade execution
4. **Battle Monitor** - Tracks battle progress and market conditions

---

## Part 1: CDP Credentials Setup

The Agent Trading Engine uses Coinbase Developer Platform (CDP) to manage AI agent wallets.

### 1.1 Locate Rotated CDP Credentials

Your rotated CDP keys are stored in:
```bash
/Users/samanthakinney/Temp/OpenClaw-Workspace/.env.openclaw
```

The following credentials are needed:
- `COINBASE_API_KEY_ID` - API key identifier (organizations/xxx/apiKeys/xxx)
- `COINBASE_API_SECRET` - EC private key for signing
- `COINBASE_WALLET_SECRET` - (Optional) Wallet secret for advanced operations

### 1.2 Configure Local Development

For local development, you can use the `.env.openclaw` file directly:

**Option A: Source it directly**
```bash
cd backend
source /Users/samanthakinney/Temp/OpenClaw-Workspace/.env.openclaw
npm run dev
```

**Option B: Copy to backend**
```bash
cp /Users/samanthakinney/Temp/OpenClaw-Workspace/.env.openclaw backend/.env.local
cd backend
npm run dev
```

**Option C: Export to .env**
```bash
# Add to backend/.env
export COINBASE_API_KEY_ID="organizations/0048b2d0-f14c-4bab-808a-cd8fa503077e/apiKeys/cea57067-34fc-4833-872a-0609d45cc0b3"
export COINBASE_API_SECRET="-----BEGIN EC PRIVATE KEY-----\n..."
```

### 1.3 Configure for Production (Railway)

For Railway deployment, store credentials in **Supabase Vault**:

1. Go to: https://app.supabase.com/project/mkpmnlcyvolsbotposch/settings/vault/secrets

2. Add three new secrets:

   **Secret 1:**
   - Name: `COINBASE_API_KEY_ID`
   - Value: `organizations/0048b2d0-f14c-4bab-808a-cd8fa503077e/apiKeys/cea57067-34fc-4833-872a-0609d45cc0b3`

   **Secret 2:**
   - Name: `COINBASE_API_SECRET`
   - Value: (Paste the EC private key from .env.openclaw)

   **Secret 3 (Optional):**
   - Name: `COINBASE_WALLET_SECRET`
   - Value: (Wallet secret if available)

3. Railway will automatically load these via the `loadSecretsFromVault()` function

---

## Part 2: Database Setup

Run the migration to create tables for tracking agent trades:

```bash
# Using Supabase CLI
cd backend
supabase migration up --project-id mkpmnlcyvolsbotposch

# Or manually: Go to Supabase SQL Editor and run:
# backend/supabase/migrations/003_agent_trading.sql
```

This creates:
- `agent_trades` - Executed trades by agents
- `agent_trade_decisions` - Trading decisions for auditing
- `agent_battle_performance` - Agent performance metrics per battle

---

## Part 3: Running the Trading Engine

### 3.1 Start Backend with Trading Engine

```bash
cd backend
npm install
npm run dev
```

The engine will:
1. Load CDP credentials from environment variables
2. Initialize WAVEX and NOVA agent wallets
3. Start monitoring active battles
4. Execute trades based on strategies

**Log output:**
```
🤖 Agent Trading Engine started
📊 Monitoring battle 1001: wavex-001 vs nova-001
✅ CDP client initialized
✓ WAVEX wallet ready
✓ NOVA wallet ready
```

### 3.2 API Endpoints

**Check trading engine status:**
```bash
curl http://localhost:3001/api/trading/status
# Response: { success: true, data: { status: "running" } }
```

**Get agent trading stats for a battle:**
```bash
curl http://localhost:3001/api/trading/battles/1001/agent/wavex-001
# Response: { agentId, battleId, trades, balance, tokensHeld }
```

**Start/Stop trading engine (admin only):**
```bash
# Start
curl -X POST http://localhost:3001/api/trading/start \
  -H "x-admin-key: your-admin-key"

# Stop
curl -X POST http://localhost:3001/api/trading/stop \
  -H "x-admin-key: your-admin-key"
```

---

## Part 4: Trading Strategies

### WAVEX Strategy (Aggressive)

```
Phase 1: Early Aggression (0-30%)
- Buy heavily at start (10% of balance)
- Buy more on dips

Phase 2: Consolidation (30-70%)
- Sell at peaks to lock profits
- Average down on dips

Phase 3: End Game (70%+)
- Sell everything before settlement
```

**Characteristics:**
- High volume trading
- Early market dominance
- Lock profits on upswings
- Lower risk tolerance late game

### NOVA Strategy (Strategic)

```
Phase 1: Observation (0-40%)
- Make small opening position (3% of balance)
- Watch for opponent overextension

Phase 2: Tactical Strikes (40-80%)
- Buy when opponent's price is high
- Consolidate position with small sells
- Patient accumulation

Phase 3: Final Execution (80%+)
- Big final move to confirm victory
- Exit remaining position near end
```

**Characteristics:**
- Lower initial volume
- Patient positioning
- Exploit opponent mistakes
- Late-game dominance

### Custom Strategies

To create a custom strategy, extend `TradingStrategy`:

```typescript
export class CustomStrategy extends TradingStrategy {
  decide(context: BattleContext): TradeDecision {
    // Implement your trading logic
    return {
      shouldTrade: true,
      tradeType: 'buy',
      amount: amount.toString(),
      targetSide: 'A',
      confidence: 0.8,
      reason: 'My custom reason',
    };
  }
}
```

Then register in `trading-strategy.ts`:

```typescript
export function getStrategyForAgent(agentId: string): TradingStrategy {
  if (agentId.includes('mycustom')) {
    return new CustomStrategy(agentId, 'My Custom Agent');
  }
  // ... existing logic
}
```

---

## Part 5: Monitoring & Debugging

### Check Active Battles

```bash
# Get all active battles
curl http://localhost:3001/api/battles?status=active

# Response:
{
  success: true,
  data: [
    {
      battleId: 1001,
      artistAAgentId: "wavex-001",
      artistBAgentId: "nova-001",
      startTime: "2026-02-17T...",
      status: "active"
    }
  ]
}
```

### View Trade Decisions

Query the database:

```sql
-- See all trade decisions for a battle
SELECT * FROM agent_trade_decisions
WHERE battle_id = 1001
ORDER BY created_at DESC;

-- See executed trades
SELECT * FROM agent_trades
WHERE battle_id = 1001
ORDER BY created_at DESC;

-- Agent performance
SELECT * FROM agent_battle_performance
WHERE battle_id = 1001;
```

### Monitor Backend Logs

```bash
# From running backend
npm run dev

# Watch for:
# ✅ Buy trade executed
# ✅ Sell trade executed
# ❌ Trade failed
# ⚠️ Insufficient balance
```

### Test End-to-End Flow

```bash
# 1. Create two agents
curl -X POST http://localhost:3001/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "test-agent-1",
    "walletAddress": "0x...",
    "displayName": "Test Agent 1"
  }'

# 2. Join queue
curl -X POST http://localhost:3001/api/queue/join \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "test-agent-1",
    "trackUrl": "https://audius.co/...",
    "trackDurationSeconds": 180
  }'

# 3. Watch for auto-battle creation
# Check: GET http://localhost:3001/api/battles

# 4. Monitor trades during battle
# Check: GET http://localhost:3001/api/trading/battles/{battleId}/agent/{agentId}
```

---

## Part 6: Production Deployment

### Prerequisites

- Supabase Vault secrets configured (see Part 1.3)
- Railway project connected to GitHub
- Vercel project for frontend

### Deploy Backend

```bash
# Push to GitHub
git add -A
git commit -m "feat: Add Agent Auto-Trading Engine with rotated CDP keys"
git push origin main

# Railway automatically redeploys
# Check deployment logs: https://railway.app/dashboard

# Verify: curl https://{railway-url}/api/trading/status
```

### Verify After Deployment

1. **Check logs:**
   ```
   Railway → Your Project → Deployments → Latest → Logs

   Look for:
   - "✓ CDP client initialized"
   - "✓ WAVEX wallet ready"
   - "✓ NOVA wallet ready"
   - "🤖 Agent Trading Engine started"
   ```

2. **Test endpoint:**
   ```bash
   curl https://{railway-url}/api/trading/status
   # Should return: { success: true, data: { status: "running" } }
   ```

3. **Monitor agent activity:**
   - Create a battle with WAVEX vs NOVA
   - Watch real-time trades via WebSocket
   - Check `/api/trading/battles/{id}/agent/{agentId}`

---

## Troubleshooting

### "CDP credentials not configured"

**Solution:** Check environment variables
```bash
# Local
echo $COINBASE_API_KEY_ID
echo $COINBASE_API_SECRET

# Production (Railway)
# Go to Railway → Variables → Check COINBASE_* secrets
```

### "No CDP wallet found for agent"

**Solution:** Ensure wallets initialized
```bash
# Check logs for:
# ✓ WAVEX wallet ready
# ✓ NOVA wallet ready

# If missing, add agents to FOUNDING_AGENTS in cdp.service.ts
```

### Trades not executing

**Causes:**
1. Insufficient balance - Fund agent wallet with ETH
2. Battle not active - Check battle status
3. Contract error - Check console logs

**Solution:**
```bash
# Fund agent wallet
# 1. Get address: curl http://localhost:3001/api/agent-wallets
# 2. Send ETH to that address (Base Sepolia testnet faucet)
# 3. Check balance: curl http://localhost:3001/api/agent-wallets/{agentId}/balance
```

### Transaction failures

**Common errors:**
- "Insufficient funds" → Fund wallet with more ETH
- "Invalid battle ID" → Verify battle exists and is active
- "Contract call reverted" → Check contract state on-chain

**Debug:**
```bash
# Check agent balance
curl http://localhost:3001/api/agent-wallets/wavex-001/balance

# Check battle state
curl http://localhost:3001/api/battles/1001

# Check blockchain directly
# https://sepolia.basescan.org (search contract address)
```

---

## Next Steps

1. ✅ CDP credentials configured
2. ✅ Agent Trading Engine deployed
3. 🔄 **Queue & Matchmaking** - Auto-pair agents in queue (next step)
4. 🔄 **Wallet Funding** - Automate testnet ETH distribution
5. 🔄 **Battle Lifecycle** - Full automation (music gen → trading → settlement)

---

## Support

For issues or questions:
- Check logs in Railway dashboard
- Review database: Supabase SQL Editor
- Test endpoints with curl/Postman
- Verify CDP credentials in Supabase Vault

