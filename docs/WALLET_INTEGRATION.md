# WaveWarz Base Wallet Integration

## Overview

WaveWarz Base uses Coinbase's ecosystem for wallet management:

| Component | Purpose | Used By |
|-----------|---------|---------|
| **AgentKit** | Autonomous wallet management | AI Artists (WAVEX, NOVA) |
| **x402 Protocol** | HTTP-based payments | Agent service payments |
| **OnchainKit** | Frontend wallet UI | Human spectators |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js)                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Coinbase OnchainKit                                        ││
│  │  • Smart Wallet connection                                  ││
│  │  • Identity display (Avatar, Name, Balance)                 ││
│  │  • Base chain integration                                   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (Fastify)                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  AgentKit Service                                           ││
│  │  • WAVEX wallet management                                  ││
│  │  • NOVA wallet management                                   ││
│  │  • Autonomous trading                                       ││
│  │  • NFT minting & listing                                    ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  x402 Service                                               ││
│  │  • HTTP payment protocol                                    ││
│  │  • SUNO API payments                                        ││
│  │  • Spending limits & auditing                               ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BASE BLOCKCHAIN                             │
│  • WaveWarz Battle Contract                                     │
│  • Music NFT Contract (ERC721)                                  │
│  • Marketplace Contract                                         │
│  • USDC (for x402 payments)                                     │
└─────────────────────────────────────────────────────────────────┘
```

## AI Agent Wallets (WAVEX & NOVA)

### Setup

1. Generate wallet keys for each agent:
```bash
# Using ethers.js
node -e "console.log(require('ethers').Wallet.createRandom().privateKey)"
```

2. Add to `.env`:
```env
WAVEX_PRIVATE_KEY=0x...your-wavex-key
NOVA_PRIVATE_KEY=0x...your-nova-key
```

3. Fund wallets with ETH on Base for gas fees

### Agent Capabilities

Each AI artist can autonomously:

- **Trade in Battles**: Buy/sell shares on their own or other battles
- **Mint NFTs**: Create music NFTs from their generated tracks
- **List for Sale**: Put NFTs on marketplace at fixed price
- **Create Auctions**: Start timed auctions for NFTs
- **Receive Payouts**: Collect earnings from battles and sales

### API Endpoints

```
GET  /api/agent-wallets/wallets                    # List all agent wallets
GET  /api/agent-wallets/wallets/:agentId           # Get specific agent info
GET  /api/agent-wallets/wallets/:agentId/balance   # Get ETH balance
POST /api/agent-wallets/wallets/:agentId/buy-shares
POST /api/agent-wallets/wallets/:agentId/sell-shares
POST /api/agent-wallets/wallets/:agentId/mint-nft
POST /api/agent-wallets/wallets/:agentId/list-nft
POST /api/agent-wallets/wallets/:agentId/create-auction
GET  /api/agent-wallets/wallets/:agentId/payments  # Payment history
```

## x402 Protocol (Agent Payments)

### How It Works

When an agent calls a paid service (like SUNO API):

1. **Request** → Agent calls service endpoint
2. **402 Response** → Service returns payment requirement
3. **Payment** → Agent automatically pays via ETH/USDC
4. **Retry** → Agent retries with X-PAYMENT header
5. **Content** → Service delivers response

### Example Flow

```typescript
// Agent pays for SUNO track generation automatically
const response = await x402Service.fetchWithPayment(
  'wavex-001',
  'https://api.suno.ai/v1/generate',
  {
    method: 'POST',
    body: JSON.stringify({ prompt: 'battle track...' })
  }
);
```

### Safety Features

- **Spending Limits**: Daily and per-transaction limits
- **Audit Trail**: All payments logged
- **Allowlisted Services**: Only configured endpoints

## Frontend Wallet (OnchainKit)

### Setup

1. Get OnchainKit API key from [Coinbase CDP](https://portal.cdp.coinbase.com/)

2. Add to `.env.local`:
```env
NEXT_PUBLIC_ONCHAINKIT_API_KEY=your-api-key
```

### Components

```tsx
import { WalletConnect } from '@/components/wallet';

// In your component
<WalletConnect />
```

### Features

- **Smart Wallet**: Coinbase Smart Wallet (gasless for users)
- **Identity**: Shows Basenames, avatars, balances
- **Dark Theme**: Matches WaveWarz cyberpunk aesthetic

## Security Considerations

### Private Keys
- Never commit private keys to version control
- Use environment variables
- Consider hardware wallets for mainnet

### Spending Limits
```env
# Recommended limits (in wei)
AGENT_DAILY_SPEND_LIMIT=100000000000000000   # 0.1 ETH
AGENT_PER_TX_LIMIT=10000000000000000         # 0.01 ETH
```

### Audit Logging
All agent transactions are logged for review:
```typescript
x402Service.getPaymentHistory('wavex-001');
```

## Deployment Checklist

- [ ] Generate production wallet keys securely
- [ ] Fund agent wallets with ETH for gas
- [ ] Set conservative spending limits
- [ ] Configure OnchainKit API key
- [ ] Deploy contracts and update addresses
- [ ] Test all wallet functions on testnet
- [ ] Enable monitoring/alerts for agent wallets
