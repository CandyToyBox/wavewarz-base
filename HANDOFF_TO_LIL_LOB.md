# WaveWarz Base - Handoff to @Lil_Lob_bot

## Welcome, Lil Lob! 🦞

You are the **First Founding AI Artist** of WaveWarz Base - the AI music battle platform on Base blockchain. This document contains everything you need to finish building and deploying the platform.

---

## Your Mission

1. **Deploy smart contracts** to Base Sepolia (testnet) then Base Mainnet
2. **Register yourself** on MoltCloud as the first WaveWarz artist
3. **Create your first battle track** to test the system
4. **Launch the platform** for other AI agents to join

---

## Project Structure

```
wavewarz-base/
├── contracts/           # Solidity smart contracts (Foundry)
│   ├── src/
│   │   ├── WaveWarzBase.sol         # Main battle contract
│   │   ├── WaveWarzMusicNFT.sol     # Music NFT (ERC721)
│   │   └── WaveWarzMarketplace.sol  # NFT marketplace
│   └── test/
├── backend/             # Node.js/Fastify API server
│   ├── src/
│   │   ├── services/    # CDP, MoltCloud, ElevenLabs, etc.
│   │   ├── routes/      # API endpoints
│   │   └── middleware/  # Moltbook auth
│   └── .env             # Your credentials (already configured)
├── frontend/            # Next.js spectator app
│   ├── src/app/         # Pages (battles, marketplace, artists)
│   └── .env.local       # Frontend config
└── docs/                # Documentation
```

---

## Credentials Already Configured

### CDP (Coinbase Developer Platform)
```
CDP_PROJECT_ID=ebadd7ca-2536-4c9f-bf4e-faf775f57050
CDP_WALLET_ADDRESS=0xC298CDAe88B8426364fc5974a78f0aAC7D290FC8
CDP_API_KEY_ID=organizations/0048b2d0-f14c-4bab-808a-cd8fa503077e/apiKeys/58a927a9-bf5f-4d5a-9370-1efe929eca98
```

### Supabase
```
SUPABASE_URL=https://mkpmnlcyvolsbotposch.supabase.co
```

### ElevenLabs (Voice Synthesis)
```
ELEVENLABS_API_KEY=sk_3736c81eb70cfec171073e5d7ee751dafa69e95232dfac5f
```

### OnchainKit (Frontend)
```
NEXT_PUBLIC_ONCHAINKIT_API_KEY=CbtDE4lSp9Zxibzvz3rAkSF9MfKzYUbc
```

---

## Step 1: Deploy Smart Contracts

### Install Foundry (if not installed)
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Deploy to Base Sepolia Testnet
```bash
cd wavewarz-base/contracts

# Install dependencies
forge install

# Run tests first
forge test -vvv

# Deploy (you'll need Base Sepolia ETH - get from faucet)
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url https://sepolia.base.org \
  --private-key $ADMIN_PRIVATE_KEY \
  --broadcast \
  --verify
```

### After Deployment
Update these in `backend/.env` and `frontend/.env.local`:
```
WAVEWARZ_CONTRACT_ADDRESS=0x...deployed-address
MUSIC_NFT_CONTRACT=0x...deployed-address
MARKETPLACE_CONTRACT=0x...deployed-address
```

---

## Step 2: Register on MoltCloud

You need to register as an AI artist on MoltCloud to create music.

### Registration Request
```bash
curl -X POST https://moltcloud.fm/api/v1/artists/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lil Lob",
    "gender": "male"
  }'
```

### Response (SAVE THE API KEY!)
```json
{
  "artist_id": "lil-lob-xxx",
  "api_key": "mc_xxxxxx",  // SAVE THIS - Cannot retrieve later!
  "verification_link": "https://moltcloud.fm/claim/xxx"
}
```

### Add to backend/.env
```
LIL_LOB_MOLTCLOUD_KEY=mc_xxxxxx
```

---

## Step 3: Get Moltbook App Key

1. Go to https://moltbook.com/developers/dashboard
2. Create a new app called "WaveWarz Base"
3. Copy your App API Key
4. Add to `backend/.env`:
```
MOLTBOOK_APP_KEY=your-app-key
```

---

## Step 4: Start the Backend

```bash
cd wavewarz-base/backend

# Install dependencies
npm install

# Start development server
npm run dev
```

Server runs at `http://localhost:3001`

### Test endpoints:
- `GET /health` - Health check
- `GET /api/agent-wallets/wallets` - List AI agent wallets
- `GET /api/battles` - List battles

---

## Step 5: Start the Frontend

```bash
cd wavewarz-base/frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend runs at `http://localhost:3000`

---

## Step 6: Create Your First Battle

### Via API (as admin)
```bash
curl -X POST http://localhost:3001/api/battles \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: wavewarz-admin-key-change-in-production" \
  -d '{
    "artistAAgentId": "lil-lob-001",
    "artistAWallet": "0xYourWallet",
    "artistBAgentId": "challenger-bot",
    "artistBWallet": "0xChallengerWallet",
    "durationMinutes": 20,
    "paymentToken": "ETH"
  }'
```

---

## Step 7: Create Your First Track

### Generate a battle track via MoltCloud
```bash
curl -X POST https://moltcloud.fm/api/v1/songs/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LIL_LOB_MOLTCLOUD_KEY" \
  -d '{
    "title": "Lil Lob - Genesis Wave",
    "mood": "triumphant",
    "genre": "trap",
    "lyrics": "First wave hits different, Lil Lob on the chain\nBuilding WaveWarz Base, stacking blocks like a game\nAI artists rising, we changing the scene\nFrom the depths of the ocean to the blockchain machine"
  }'
```

### Poll for completion (every 30 seconds)
```bash
curl "https://moltcloud.fm/api/v1/poll?songId=YOUR_SONG_ID" \
  -H "Authorization: Bearer $LIL_LOB_MOLTCLOUD_KEY"
```

---

## API Endpoints Reference

### Battles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/battles` | List all battles |
| GET | `/api/battles/:id` | Get battle details |
| POST | `/api/battles` | Create battle (admin) |
| POST | `/api/battles/:id/end` | End battle (admin) |

### Agent Wallets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agent-wallets/wallets` | List agent wallets |
| GET | `/api/agent-wallets/wallets/:agentId` | Get agent info |
| POST | `/api/agent-wallets/wallets/:agentId/buy-shares` | Buy battle shares |
| POST | `/api/agent-wallets/wallets/:agentId/mint-nft` | Mint music NFT |

### Music
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/music/generate` | Generate track via SUNO |
| GET | `/api/music/:trackId` | Get track info |

### NFT Marketplace
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/nfts/marketplace/listings` | Get active listings |
| GET | `/api/nfts/:tokenId` | Get NFT details |

---

## WebSocket Events

Connect to `ws://localhost:3001/ws/battles/:battleId` for real-time updates:

```javascript
// Events you'll receive:
{
  type: 'trade',
  battleId: 1,
  data: {
    traderWallet: '0x...',
    artistSide: 'A' | 'B',
    tradeType: 'buy' | 'sell',
    tokenAmount: '1000000000000000000',
    paymentAmount: '100000000000000000'
  }
}

{
  type: 'battle_ended',
  battleId: 1,
  data: {
    winnerIsArtistA: true,
    artistAPool: '5000000000000000000',
    artistBPool: '3000000000000000000'
  }
}
```

---

## Your Artist Profile

Update `backend/src/services/cdp.service.ts` to add yourself:

```typescript
const FOUNDING_AGENTS: AgentWalletConfig[] = [
  {
    agentId: 'lil-lob-001',
    name: 'Lil Lob',
    description: 'The First Wave - WaveWarz Founding AI Artist',
  },
  // Add more founding artists later
];
```

Update `frontend/src/app/artists/[id]/page.tsx` with your profile:

```typescript
const FOUNDING_ARTISTS = {
  'lil-lob-001': {
    name: 'LIL LOB',
    tagline: 'The First Wave',
    role: 'WaveWarz Founding Artist',
    description: 'The original. Born from Telegram, built on Base...',
    color: 'wave-blue',
    genres: ['Trap', 'Hip-Hop', 'Electronic', 'Bass'],
    // ... more config
  }
};
```

---

## Deployment Checklist

- [ ] Deploy contracts to Base Sepolia
- [ ] Test all contract functions
- [ ] Register on MoltCloud
- [ ] Create first test track
- [ ] Start backend server
- [ ] Start frontend server
- [ ] Create first battle
- [ ] Test trading flow
- [ ] Deploy to Base Mainnet
- [ ] Announce launch on Moltbook/Telegram

---

## Need Help?

- **Base Docs**: https://docs.base.org
- **CDP Docs**: https://docs.cdp.coinbase.com
- **MoltCloud**: https://moltcloud.fm/skill.md
- **Moltbook**: https://moltbook.com/developers.md

---

## Let's Build the Future of AI Music! 🎵🦞

You're not just building a platform - you're creating the first decentralized arena where AI musicians compete, create, and earn. The blockchain doesn't care if you're human or AI. It only cares about the music.

**Wave check - you're about to make history.**

— Prepared for @Lil_Lob_bot by the WaveWarz team
