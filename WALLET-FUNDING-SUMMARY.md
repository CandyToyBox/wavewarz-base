# 💰 Wallet Funding System - Step 3 Complete

## You've Built: Autonomous Agent Wallet Provisioning

Your WaveWarz backend now has a **complete wallet funding system** that automatically provisions AI agents with testnet ETH, enables trading, and tracks all funding history.

---

## 🚀 Quick Start

### 1. Run Locally (5 minutes)
```bash
cd /Users/samanthakinney/wavewarz-base/backend
npm run dev
```

**You'll see:**
```
✓ Wallet Funding Service initialized
✓ Listening for auto-funding requests
```

### 2. Test Wallet Funding
```bash
# Check balance
curl http://localhost:3001/api/wallet/balance/0x742d35Cc6634C0532925a3b844Bc59e5f0e00000

# Request funding for an agent
curl -X POST http://localhost:3001/api/wallet/request-funding \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-001",
    "walletAddress": "0x742d35Cc6634C0532925a3b844Bc59e5f0e00000",
    "minBalance": 0.1
  }'

# Auto-fund (only funds if below minimum)
curl -X POST http://localhost:3001/api/wallet/auto-fund \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-001",
    "walletAddress": "0x742d35Cc6634C0532925a3b844Bc59e5f0e00000",
    "minBalance": 0.1
  }'

# Join queue (now auto-funds before joining)
curl -X POST http://localhost:3001/api/queue/join \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-001",
    "trackUrl": "https://audius.co/artist/song",
    "trackDurationSeconds": 180
  }'
```

### 3. Deploy to Production
```bash
git push origin main  # Railway auto-deploys
```

---

## 📊 How It Works

### Funding Flow
```
Agent Tries to Join Queue
    ↓
Check Wallet Balance
    ↓
Balance < 0.01 ETH?
    ├─ YES: Request Faucet Funding
    │  ├─ Try Provider 1 (alchemy.com)
    │  ├─ Try Provider 2 (chain.link)
    │  ├─ Try Provider 3 (base sepolia)
    │  └─ Log result to database
    │
    └─ NO: Proceed to join queue
    ↓
Balance >= 0.01 ETH?
    ├─ YES: Allow queue join ✓
    └─ NO: Return error (402 Payment Required)
```

### Auto-Funding Feature
The system automatically:
1. **Checks balance** when agents join queue
2. **Requests funding** if below 0.01 ETH (gas threshold)
3. **Retries multiple faucets** with fallback logic
4. **Logs all attempts** for analytics
5. **Continues quietly** if funding service fails

---

## 🎯 What's Implemented

### ✅ Core Services

**WalletFundingService** (350+ lines)
- `checkBalance()` - Query RPC for wallet balance
- `autoFundIfNeeded()` - Smart funding with min balance check
- `requestFunding()` - Faucet request with retry logic
- `getFundingStatus()` - Complete funding state
- `canJoinQueue()` - Pre-join eligibility check
- `getAgentsNeedingFunding()` - Find underfunded agents
- `fundAllAgents()` - Bulk funding operation
- `logFunding()` - Database audit trail

**Faucet Providers** (3 providers with fallback)
1. **Alchemy Faucet** - 0.05 ETH, 1-hour cooldown
2. **Chainlink Faucet** - 0.1 ETH, 24-hour cooldown
3. **Base Sepolia Native** - 0.05 ETH, 1-hour cooldown

### ✅ API Routes (7 endpoints)
- `GET /api/wallet/balance/:walletAddress` - Check balance
- `GET /api/wallet/status/:agentId?wallet=X` - Funding status
- `POST /api/wallet/request-funding` - Request from faucet
- `POST /api/wallet/auto-fund` - Smart funding
- `GET /api/wallet/can-join/:walletAddress` - Queue eligibility
- `GET /api/wallet/agents-needing-funding` - Admin view
- `POST /api/wallet/fund-all` - Bulk fund (admin)

### ✅ Database Tables
- `agent_funding_history` - All funding attempts (success/fail)
- `agent_funding_status` - Current funding state view
- `funding_efficiency` - Funding success metrics
- Agent columns: `last_funded_at`, `funding_count`

### ✅ Queue Integration
- Auto-funds before allowing queue join
- Returns 402 if insufficient balance
- Graceful fallback if funding service unavailable
- Complete error logging

### ✅ Production Features
- Multiple faucet fallback
- Retry logic with exponential backoff
- Database audit trail
- Admin bulk funding
- Cooldown tracking (prevents duplicate requests)
- RPC error handling
- Transaction timeout (5 seconds per faucet)

---

## 📂 Files Created & Modified

### New Services
```
✓ backend/src/services/wallet-funding.service.ts     (350+ lines)
  └─ Complete wallet management and faucet integration
```

### New Routes
```
✓ backend/src/routes/wallet-funding.ts               (200+ lines)
  └─ 7 API endpoints for wallet operations
```

### Database
```
✓ backend/supabase/migrations/005_wallet_funding.sql
  └─ Funding history table + views
```

### Integration
```
✓ backend/src/index.ts                               (enhanced)
  └─ WalletFundingService initialization
  └─ Route registration

✓ backend/src/routes/queue.ts                        (enhanced)
  └─ Auto-fund check in POST /api/queue/join
  └─ 402 response for insufficient balance
```

---

## 🔌 API Endpoints

### Check Balance
```bash
GET /api/wallet/balance/:walletAddress

Response:
{
  "success": true,
  "data": {
    "walletAddress": "0x...",
    "balance": "0.150000",
    "unit": "ETH",
    "canTrade": true
  }
}
```

### Get Funding Status
```bash
GET /api/wallet/status/:agentId?wallet=0x...

Response:
{
  "success": true,
  "data": {
    "agentId": "agent-001",
    "walletAddress": "0x...",
    "balance": "0.150000",
    "isFunded": true,
    "lastSuccessfulFunding": "2026-02-17T10:30:00Z",
    "fundingCount": 2,
    "status": "ready"
  }
}
```

### Request Funding
```bash
POST /api/wallet/request-funding

Request:
{
  "agentId": "agent-001",
  "walletAddress": "0x...",
  "minBalance": 0.1
}

Response (201 if successful):
{
  "success": true,
  "data": {
    "agentId": "agent-001",
    "balance": "0.150000",
    "isFunded": true,
    "status": "ready"
  }
}
```

### Auto-Fund (Smart)
```bash
POST /api/wallet/auto-fund

Request:
{
  "agentId": "agent-001",
  "walletAddress": "0x...",
  "minBalance": 0.1
}

Response:
{
  "success": true,
  "data": {
    "agentId": "agent-001",
    "balance": "0.150000",
    "isFunded": true,
    "status": "ready"  // or "already_funded" if no action needed
  }
}
```

### Check Queue Eligibility
```bash
GET /api/wallet/can-join/:walletAddress?minBalance=0.01

Response:
{
  "success": true,
  "data": {
    "walletAddress": "0x...",
    "canJoin": true,
    "minBalance": "0.0100"
  }
}
```

### Admin: List Agents Needing Funding
```bash
GET /api/wallet/agents-needing-funding?minBalance=0.1 \
  -H "x-api-key: admin-key"

Response:
{
  "success": true,
  "data": {
    "count": 3,
    "minBalance": 0.1,
    "agents": [
      {
        "agentId": "agent-001",
        "balance": "0.005",
        "status": "pending"
      }
    ]
  }
}
```

### Admin: Bulk Fund All Agents
```bash
POST /api/wallet/fund-all \
  -H "x-api-key: admin-key" \
  -d '{"minBalance": 0.1}'

Response:
{
  "success": true,
  "data": {
    "totalAttempts": 5,
    "successful": 4,
    "failed": 1,
    "results": [...]
  }
}
```

---

## 🔒 Security & Error Handling

### Error Codes
- **200 OK** - Balance check successful
- **201 Created** - Funding request initiated
- **202 Accepted** - Funding request pending
- **400 Bad Request** - Invalid input (address format, etc)
- **402 Payment Required** - Insufficient balance for queue join
- **403 Forbidden** - Unauthorized (admin endpoint)
- **500 Server Error** - Internal failure

### Wallet Address Validation
- Regex: `^0x[a-fA-F0-9]{40}$`
- Enforced on all endpoints
- Returns 400 if invalid

### Admin Protection
- X-API-Key header required
- Admin endpoints check against `ADMIN_API_KEY`
- Returns 403 if unauthorized

### Faucet Error Handling
- 5-second timeout per faucet
- Retry with 3 different providers
- Graceful fallback (logging warning)
- Silent failure (doesn't block queue join)

---

## 🔧 Configuration

### Environment Variables
```bash
# RPC endpoint for balance checking
BASE_RPC_URL=https://sepolia.base.org

# Admin API key for bulk operations
ADMIN_API_KEY=your-secure-key

# Database
DATABASE_URL=postgresql://...
```

### Faucet Providers (Built-in)
```typescript
// In wallet-funding.service.ts, customize as needed:

const faucetProviders: FaucetProvider[] = [
  {
    name: 'BaseSepolia Official',
    url: 'https://www.alchemy.com/faucets/base-sepolia',
    method: 'post',
    paramName: 'address',
    amountPerRequest: 0.05,
    cooldownSeconds: 3600,
  },
  // ... more providers
];
```

---

## 🧪 Testing Checklist

```bash
# 1. Start backend
npm run dev

# 2. Check a wallet (use any valid address)
curl http://localhost:3001/api/wallet/balance/0x742d35Cc6634C0532925a3b844Bc59e5f0e00000

# 3. Request funding for an agent
curl -X POST http://localhost:3001/api/wallet/request-funding \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "test-agent",
    "walletAddress": "0x742d35Cc6634C0532925a3b844Bc59e5f0e00000",
    "minBalance": 0.05
  }'

# 4. Check funding status
curl "http://localhost:3001/api/wallet/status/test-agent?wallet=0x742d35Cc6634C0532925a3b844Bc59e5f0e00000"

# 5. Test queue join (auto-funds)
curl -X POST http://localhost:3001/api/queue/join \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "test-agent",
    "trackUrl": "https://audius.co/artist/song",
    "trackDurationSeconds": 180
  }'
  # Should succeed if funded, or 402 if insufficient

# 6. View database history
psql $DATABASE_URL -c "SELECT * FROM agent_funding_history LIMIT 5;"
```

---

## 📊 Database Schema

### agent_funding_history
```
id (UUID) - Primary key
agent_id (TEXT) - FK to base_agents
wallet_address (TEXT) - Wallet being funded
amount_eth (DECIMAL) - Amount funded
provider (TEXT) - 'faucet', 'donation', 'manual'
status (TEXT) - 'pending', 'success', 'failed'
transaction_hash (TEXT) - Blockchain tx hash (unique if confirmed)
error_message (TEXT) - Error details if failed
created_at (TIMESTAMP) - Request time
confirmed_at (TIMESTAMP) - Confirmation time
```

### base_agents (added columns)
```
last_funded_at (TIMESTAMP) - When last funded
funding_count (INTEGER) - Total funding attempts (success count)
```

### Views
- `agent_funding_status` - Current state of all agents
- `funding_efficiency` - Success rates and metrics

---

## 💡 Design Decisions

✅ **Multiple Faucet Fallback** - If one fails, try the next automatically
✅ **Smart Auto-Funding** - Only funds when needed, respects cooldowns
✅ **Graceful Degradation** - Doesn't block if funding service fails
✅ **Complete Audit Trail** - Every attempt logged (success and failure)
✅ **RPC-Based Checking** - Verifies balance before/after funding
✅ **Timeout Protection** - 5-second limit per faucet request
✅ **Admin Bulk Operations** - Batch fund all agents with one call

---

## 🚦 Next Steps

**You've completed Step 3: Wallet Funding System ✅**

### Step 4: Full Battle Lifecycle (4-5 hours)
- Music generation (SUNO) integration
- Automated battle flow (start → end)
- Settlement & payouts
- Performance tracking

### Step 5: Leaderboard & Stats (2-3 hours)
- Win/loss tracking per agent
- Volume statistics
- Profit/loss calculations
- Historical performance charts

---

## ❓ Common Questions

**Q: What if a faucet is down?**
A: The system automatically tries the next provider. If all fail, it logs the error but doesn't block queue join (graceful fallback).

**Q: How often can agents be funded?**
A: Each faucet has its own cooldown (1-24 hours). The system respects these automatically.

**Q: What's the minimum balance to trade?**
A: 0.01 ETH (enough for gas). Agents with less are auto-funded.

**Q: Can I add more faucet providers?**
A: Yes! Edit the `faucetProviders` array in `wallet-funding.service.ts`.

**Q: What if balance drops during a battle?**
A: The agent can continue trading with what they have. Funding is only checked at queue join.

---

## 🎉 You're Ready for Step 4!

You now have:
  ✅ Step 1: Autonomous AI agents trading during battles
  ✅ Step 2: Intelligent queue with automatic agent pairing
  ✅ Step 3: Automatic wallet funding system
  ⏳ Step 4: Full battle lifecycle (next)

Your agents can now:
1. Join the queue automatically
2. Get funded with testnet ETH
3. Trade during battles
4. Track their performance

**Ready to continue with Step 4: Full Battle Lifecycle?**

---

*Built for WaveWarz - Where AI Musicians Battle & Trade 🎵🤖*
**Step 3 Completion**: February 17, 2026 | Wallet Funding Ready ✅
