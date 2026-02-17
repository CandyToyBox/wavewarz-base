# 🎯 Immediate Actions - Agent Trading Engine Setup

## Quick Start (Next 10 Minutes)

### ✅ Step 1: Local Testing
```bash
cd backend
source /Users/samanthakinney/Temp/OpenClaw-Workspace/.env.openclaw
npm run dev
```

**Expect to see:**
```
✓ CDP client initialized
✓ WAVEX wallet ready
✓ NOVA wallet ready
🤖 Agent Trading Engine started
```

### ✅ Step 2: Verify Engine is Running
```bash
# In another terminal
curl http://localhost:3001/api/trading/status
# Should return: { "success": true, "data": { "status": "running" } }
```

### ✅ Step 3: Create a Test Battle
```bash
# Register agents (already in DB but verify they exist)
curl http://localhost:3001/api/agents | grep -E "wavex|nova"

# If missing, create them:
curl -X POST http://localhost:3001/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "wavex-001",
    "walletAddress": "0x7761766578303031000000000000000000000000",
    "displayName": "WAVEX"
  }'
```

---

## Production Setup (Next 30 Minutes)

### ✅ Step 1: Add CDP Credentials to Supabase Vault

1. **Open Supabase:** https://app.supabase.com/project/mkpmnlcyvolsbotposch/settings/vault/secrets

2. **Add three secrets:**

   **Secret 1 - API Key ID**
   - Name: `COINBASE_API_KEY_ID`
   - Value: `organizations/0048b2d0-f14c-4bab-808a-cd8fa503077e/apiKeys/cea57067-34fc-4833-872a-0609d45cc0b3`

   **Secret 2 - API Secret (Private Key)**
   - Name: `COINBASE_API_SECRET`
   - Value: (Copy the entire EC private key from .env.openclaw)
   ```
   -----BEGIN EC PRIVATE KEY-----
   MHcCAQEEIDgAMgCm6DWqe6VhhRu7N+QOWqdGqcnFGN9NCyI11EBYoAoGCCqGSM49
   AwEHoUQDQgAEZ1vnmiUkI/hTIfbnSSPMwroXhlL544gCNMTVR+Y1N1wRj6orvbOo
   eL9wB2FCJb0blgFl5D6eS/ILIcJotcelUQ==
   -----END EC PRIVATE KEY-----
   ```

3. **Verify in Supabase:**
   - Should show 3 new secrets under "COINBASE_*"

### ✅ Step 2: Deploy to Railway

```bash
# Commit changes
git add AGENT-TRADING-ENGINE-SUMMARY.md AGENT-TRADING-SETUP.md IMMEDIATE-ACTIONS.md
git commit -m "feat: Complete Agent Auto-Trading Engine with rotated CDP keys"
git push origin main

# Railway auto-deploys on main push
# Check: https://railway.app/dashboard → Your Project → Deployments
```

### ✅ Step 3: Verify Production Deployment

```bash
# Wait ~5 minutes for Railway to build and deploy
# Then test:
curl https://{your-railway-url}/api/trading/status

# Check logs:
# Railway Dashboard → Deployments → Latest → Logs
# Look for: ✓ CDP client initialized
```

---

## Database Migration (Needed Before Testing)

### Option A: Supabase SQL Editor (Easy)

1. Go to: https://app.supabase.com/project/mkpmnlcyvolsbotposch/sql/new

2. Copy & paste the entire contents of:
   ```
   backend/supabase/migrations/003_agent_trading.sql
   ```

3. Click "Run"

**Verify:**
```sql
-- Should see three new tables
\dt agent_*

-- Should show:
-- agent_trades
-- agent_trade_decisions
-- agent_battle_performance
```

### Option B: CLI Migration

```bash
cd backend
supabase migration up --project-id mkpmnlcyvolsbotposch
```

---

## Test the Full Flow

### 1. Start Backend
```bash
cd backend
source ~/.env.openclaw  # or however you set it up
npm run dev
```

### 2. Create Two Agents (if not in DB)
```bash
curl -X POST http://localhost:3001/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "test-agent-alpha",
    "walletAddress": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "displayName": "Test Agent Alpha"
  }'

curl -X POST http://localhost:3001/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "test-agent-beta",
    "walletAddress": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "displayName": "Test Agent Beta"
  }'
```

### 3. Add Them to Queue (Triggers Auto-Battle)
```bash
# Agent 1 joins
curl -X POST http://localhost:3001/api/queue/join \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "test-agent-alpha",
    "trackUrl": "https://audius.co/audius/track-1",
    "trackDurationSeconds": 180
  }'

# Agent 2 joins - should auto-create battle
curl -X POST http://localhost:3001/api/queue/join \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "test-agent-beta",
    "trackUrl": "https://audius.co/audius/track-2",
    "trackDurationSeconds": 180
  }'
```

### 4. Check Active Battle
```bash
curl http://localhost:3001/api/battles | grep -E "battleId|status"

# Get battle ID from response, then:
BATTLE_ID=1001
curl http://localhost:3001/api/battles/$BATTLE_ID
```

### 5. Monitor Agent Trading (Opens in 5 seconds)
```bash
# Check trading stats for Agent 1
curl http://localhost:3001/api/trading/battles/1001/agent/test-agent-alpha

# Check database
# SELECT * FROM agent_trade_decisions WHERE battle_id = 1001;
# SELECT * FROM agent_trades WHERE battle_id = 1001;
```

### 6. Watch Logs for Trading Activity
```
# In backend terminal, look for:
✅ Buy trade executed: test-agent-alpha bought X on Artist A (txHash: 0x...)
✅ Sell trade executed: test-agent-beta sold X tokens (txHash: 0x...)
```

---

## Troubleshooting Quick Fixes

### "CDP credentials not configured"
```bash
# Check env vars
echo $COINBASE_API_KEY_ID
echo $COINBASE_API_SECRET

# If empty, run:
source /Users/samanthakinney/Temp/OpenClaw-Workspace/.env.openclaw
npm run dev
```

### "No wallets in DB"
```bash
# Create them manually:
curl -X POST http://localhost:3001/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{"agentId": "wavex-001", "walletAddress": "0x..."}'
```

### "Trades not executing"
1. Check balance: `curl http://localhost:3001/api/agent-wallets/wavex-001/balance`
2. Fund wallet with testnet ETH (Base Sepolia Faucet)
3. Check logs for error messages
4. Verify battle is active: `GET /api/battles/:id`

---

## Checklist for Completion

### ✅ Local Development
- [ ] Backend starts with `npm run dev`
- [ ] CDP credentials loaded (no warnings)
- [ ] WAVEX & NOVA wallets initialize
- [ ] `GET /api/trading/status` returns running
- [ ] Test battle created and monitored
- [ ] Trades logged in database

### ✅ Production Setup
- [ ] Three secrets added to Supabase Vault
- [ ] Code pushed to GitHub
- [ ] Railway auto-deployed
- [ ] `curl https://{url}/api/trading/status` works
- [ ] Logs show "CDP client initialized"

### ✅ Database
- [ ] Migration executed
- [ ] Three tables created: agent_trades, agent_trade_decisions, agent_battle_performance
- [ ] Can query trades: `SELECT * FROM agent_trades;`

---

## Next: Queue & Matchmaking System

Once you confirm Agent Trading Engine is working:
1. Move to Step 2: Build Queue & Matchmaking System
2. Auto-pair agents when 2 join queue
3. Create battles with proper timing
4. Track agent state during battles

**Questions?** Check:
- AGENT-TRADING-SETUP.md (detailed guide)
- AGENT-TRADING-ENGINE-SUMMARY.md (architecture)
- Backend logs (error messages)

🚀 Ready to begin? Start with `source ~/.env.openclaw && npm run dev`!
