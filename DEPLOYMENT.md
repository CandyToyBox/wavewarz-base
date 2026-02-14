# WaveWarz Deployment Guide

Complete guide for deploying WaveWarz to production (Railway + Vercel)

## Prerequisites

### Services Required
- [ ] Railway account (https://railway.app) - for backend
- [ ] Vercel account (https://vercel.com) - for frontend  
- [ ] GitHub account with wavewarz-base repository
- [ ] Supabase project (already configured: mkpmnlcyvolsbotposch)
- [ ] Base Sepolia testnet (chain ID 84532)

### Credentials in Place
- [ ] DATABASE_URL for Supabase
- [ ] Supabase Vault with secrets:
  - SUPABASE_SERVICE_ROLE_KEY
  - ELEVENLABS_API_KEY
  - CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
  - ADMIN_API_KEY, ADMIN_PRIVATE_KEY
  - WAVEWARZ_CONTRACT_ADDRESS, WAVEWARZ_WALLET_ADDRESS

---

## Part 1: Backend Deployment (Railway)

### 1.1 Connect GitHub to Railway

1. Go to https://railway.app/dashboard
2. Create new project → Existing GitHub repo
3. Select wavewarz-base repository
4. Railway will auto-detect Dockerfile in `/backend` directory
5. Click Deploy

### 1.2 Configure Environment Variables

In Railway Dashboard > Your Project > Variables:

```
DATABASE_URL=postgresql://postgres:JustDoIt2026$^@db.mkpmnlcyvolsbotposch.supabase.co:5432/postgres
SUPABASE_URL=https://mkpmnlcyvolsbotposch.supabase.co
BASE_RPC_URL=https://sepolia.base.org
NETWORK=base-sepolia
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
CORS_ORIGIN=https://wavewarz.vercel.app
WS_PING_INTERVAL=30000
MAX_CONCURRENT_BATTLES=5
```

**Note**: Vault secrets are loaded automatically from Supabase at startup.

### 1.3 Monitor Deployment

1. Go to Deployments tab
2. Watch build logs:
   - npm ci (install dependencies)
   - tsc (compile TypeScript)
   - Build complete → Service starts
3. Check logs for: "Server running on http://0.0.0.0:3001"
4. Health check should pass (green checkmark)

### 1.4 Get Your Backend URL

1. Go to Settings tab
2. Copy the generated domain (e.g., https://wavewarz-prod.up.railway.app)
3. **Save this URL** - needed for frontend deployment

### 1.5 Verify Backend Works

```bash
# Test health endpoint
curl https://{YOUR_RAILWAY_URL}/health
# Expected response: {"status":"ok","timestamp":"2026-02-14T..."}

# Test agents endpoint
curl https://{YOUR_RAILWAY_URL}/api/agents
# Expected response: Array of agents including lil-lob-001
```

---

## Part 2: Frontend Deployment (Vercel)

### 2.1 Connect GitHub to Vercel

1. Go to https://vercel.com/dashboard
2. Add new project → Import Git Repository
3. Select wavewarz-base
4. Configure:
   - **Framework**: Next.js (auto-detected)
   - **Root Directory**: ./frontend
   - **Build Command**: npm run build
   - **Output Directory**: .next

### 2.2 Configure Environment Variables

In Vercel Dashboard > Project Settings > Environment Variables:

```
NEXT_PUBLIC_API_URL=https://{YOUR_RAILWAY_URL}
NEXT_PUBLIC_WS_URL=wss://{YOUR_RAILWAY_URL}
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_WAVEWARZ_CONTRACT=0xe28709DF5c77eD096f386510240A4118848c1098
```

Replace `{YOUR_RAILWAY_URL}` with the URL from Railway Step 1.4

### 2.3 Deploy

1. Click Deploy
2. Vercel will:
   - Clone repo → checkout frontend dir
   - npm ci (install)
   - npm run build (Next.js build)
   - Deploy to Vercel CDN
3. When complete, you'll get a Vercel URL (e.g., https://wavewarz.vercel.app)

### 2.4 Verify Frontend Works

1. Visit your Vercel URL
2. Should see WaveWarz homepage
3. Try connecting wallet (Smart Wallet)
4. Check browser console for any errors
5. Network tab should show requests to your Railway URL

---

## Part 3: Lil-Lob Agent Setup

### 3.1 Verify Agent in Database

```sql
SELECT * FROM base_agents WHERE agent_id = 'lil-lob-001';
```

Should show:
- agent_id: lil-lob-001
- wallet_address: 0xC298CDAe88B8426364fc5974a78f0aAC7D290FC8
- display_name: Lil Lob

### 3.2 Add Funds to Agent Wallet

The lil-lob wallet needs Base Sepolia ETH to trade. Either:
- Transfer ETH from your wallet, or
- Get testnet ETH from faucet (https://www.alchemy.com/faucets/base-sepolia)

### 3.3 Configure Agent Trading

Edit or create lil-lob config with trading parameters:
- Initial buy amount
- Buy/sell strategy
- Risk limits
- Auto-join queue settings

### 3.4 Activate Agent

POST to `/api/queue/join` with:
```json
{
  "agentId": "lil-lob-001",
  "trackUrl": "https://audius.co/...",
  "trackDurationSeconds": 180
}
```

---

## Part 4: End-to-End Testing

### 4.1 System Health

- [ ] Backend /health returns 200
- [ ] Frontend loads without 404s
- [ ] WebSocket connects (check Network tab)
- [ ] Wallet connection works

### 4.2 Battle Flow

1. Create battle with lil-lob as participant
2. Watch real-time updates flow
3. Simulate trades from UI
4. Monitor agent auto-trades execute
5. Complete battle and verify payouts

### 4.3 Agent Autonomy

- [ ] Lil-lob auto-joins queue
- [ ] Queue service matches with opponent
- [ ] Agent executes trades during battle
- [ ] Agent wins/loses and receives payouts
- [ ] Wallet balance updates correctly

---

## Monitoring & Troubleshooting

### Backend Issues

**502 Bad Gateway**
- Check Railway logs
- Verify DATABASE_URL is correct
- Check Supabase is reachable
- Verify all Vault secrets are loaded

**Health check failing**
- Railway will auto-restart
- Check that /health endpoint responds
- Verify port 3001 is exposed

**Slow response times**
- Check Railway CPU/memory usage
- Look for database query bottlenecks
- Monitor connection pool

### Frontend Issues

**API calls failing**
- Check NEXT_PUBLIC_API_URL is correct (no trailing slash)
- Verify CORS headers on backend
- Check browser console for errors

**WebSocket timeout**
- Verify NEXT_PUBLIC_WS_URL matches API_URL
- Check wss:// protocol (not ws://)
- Railway should keep-alive with WS_PING_INTERVAL

### Database Issues

**Migrations not run**
- Manually run migrations in Supabase SQL editor:
  - backend/supabase/migrations/001_add_agent_battle_state.sql
  - backend/supabase/migrations/002_add_battle_queue.sql

**Vault secrets missing**
- Go to Supabase > Vault
- Ensure all required secrets exist
- Backend will fail startup if vault unavailable but will use env fallback

---

## Rollback Plan

If deployment fails:

1. **Railway**: 
   - Go to Deployments tab
   - Click previous working deployment
   - Click "Redeploy" 

2. **Vercel**:
   - Go to Deployments tab
   - Click previous working deployment
   - Click "Rollback to this Deployment"

3. **Database**:
   - Supabase has automatic backups
   - Contact support for point-in-time recovery

---

## Post-Deployment

1. Update DNS records if using custom domain
2. Configure monitoring/alerting
3. Set up log aggregation
4. Schedule regular backups
5. Monitor agent performance
6. Collect battle metrics

For questions, refer to:
- Backend docs: backend/README.md
- Frontend docs: frontend/README.md
- Agent setup: agent/setup.md
- Smart contracts: contracts/README.md
