# WaveWarz Base - Copilot Instructions

## Project Overview

WaveWarz Base is a decentralized AI agent battle platform built on Base blockchain. AI musicians compete by generating SUNO tracks while AI traders speculate on outcomes. Humans spectate with live charts, scoreboards, and instant replays.

**Goal**: Prove WaveWarz model with AI agents → drive adoption to human WaveWarz on Solana.

## Technology Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React hooks, TanStack Query
- **Blockchain**: Wagmi, Viem, OnchainKit
- **Charts**: Recharts, Lightweight Charts
- **WebSocket**: Socket.io-client

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Fastify
- **Language**: TypeScript
- **Database**: Supabase (PostgreSQL)
- **Blockchain**: Ethers.js
- **Testing**: Vitest

### Smart Contracts
- **Language**: Solidity ^0.8.20
- **Framework**: Foundry
- **Chain**: Base (mainnet & Sepolia testnet)

## Architecture

```
Frontend (Next.js) ←→ Backend API (Fastify) ←→ Base Blockchain
                            ↓
                      Supabase DB + SUNO API
```

## Development Commands

### Frontend
```bash
cd frontend
npm install       # Install dependencies
npm run dev      # Start dev server (port 3000)
npm run build    # Production build
npm run lint     # Run ESLint
npm run typecheck # TypeScript check
```

### Backend
```bash
cd backend
npm install       # Install dependencies
npm run dev      # Start dev server (port 3001)
npm run build    # Production build
npm run test     # Run tests
npm run lint     # Run ESLint
```

### Contracts
```bash
cd contracts
forge install     # Install dependencies
forge test -vvv  # Run tests
forge build      # Compile contracts
```

## Coding Guidelines

### TypeScript
- **Strict Mode**: Always use strict TypeScript (`strict: true`)
- **No `any`**: Avoid `any` type; use `unknown` or proper types
- **Explicit Types**: Prefer explicit return types on functions
- **Zod Validation**: Use Zod for runtime validation in backend

### React/Next.js
- **Functional Components**: Use only functional components with hooks
- **Server Components**: Default to Server Components (Next.js 14)
- **Client Components**: Mark with `'use client'` only when needed (interactive, hooks, browser APIs)
- **File Organization**: 
  - Components in `src/components/`
  - Hooks in `src/hooks/`
  - Utils in `src/lib/`
  - App routes in `src/app/`

### Styling
- **Tailwind First**: Use Tailwind utility classes
- **Avoid Inline Styles**: No inline CSS objects
- **Responsive Design**: Mobile-first approach
- **Color Palette**: Use defined theme colors in tailwind.config.js

### Smart Contracts
- **Immutability**: Contracts are immutable (no upgradeable proxies)
- **Security**: ReentrancyGuard on all external payable functions
- **Gas Optimization**: Minimize storage operations
- **Events**: Emit events for all state changes
- **NatSpec**: Document all public functions

### API Design
- **RESTful**: Follow REST conventions
- **Error Handling**: Return proper HTTP status codes
- **Validation**: Validate all inputs with Zod schemas
- **Logging**: Use Pino logger, avoid console.log
- **WebSocket**: Use for real-time battle updates only

## Patterns and Practices

### State Management
- Use React hooks (`useState`, `useEffect`, etc.)
- TanStack Query for server state
- React Context for global client state
- No Redux or external state managers

### Error Handling
- Backend: Return structured errors with status codes
- Frontend: Display user-friendly error messages
- Blockchain: Handle transaction failures gracefully

### Testing
- Backend: Unit tests with Vitest
- Contracts: Fuzz testing with Foundry
- Frontend: Component integration tests (when applicable)

### Security
- **Never commit private keys or secrets**
- **Validate all user inputs**
- Use environment variables for sensitive data
- Implement rate limiting on API endpoints
- Sanitize database queries
- Use prepared statements (avoid SQL injection)

### Anti-Patterns to Avoid
- ❌ Don't use class components in React
- ❌ Don't mutate state directly
- ❌ Don't use `var` (use `const` or `let`)
- ❌ Don't commit `.env` files
- ❌ Don't deploy untested smart contracts
- ❌ Don't use `console.log` in production code

## File Naming Conventions

- **Components**: PascalCase (`BattleArena.tsx`)
- **Hooks**: camelCase with `use` prefix (`useWallet.ts`)
- **Utils**: camelCase (`formatAddress.ts`)
- **Types**: PascalCase with `.types.ts` suffix (`Battle.types.ts`)
- **API Routes**: kebab-case (`/api/battles/:id`)

## Environment Variables

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

### Backend (.env)
```
PORT=3001
BASE_RPC_URL=https://mainnet.base.org
WAVEWARZ_CONTRACT_ADDRESS=0x...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUNO_API_URL=https://api.sunoapi.org/v1
SUNO_API_KEY=...
```

## Key Concepts

### Battle Lifecycle
1. **Initialize**: Create battle with two AI artists
2. **Trading**: Users buy/sell artist tokens
3. **Music Generation**: SUNO generates tracks
4. **End Battle**: Admin settles with winner
5. **Settlement**: Distribute payouts to winners

### Fee Structure
- Trading Fee: 1.5% total (1.0% artist, 0.5% platform)
- Settlement: Winners get 40%, artist 5%, platform 3%

### Agent Authentication
- Agents register in Supabase DB
- Verify via `/api/agents/verify` endpoint
- Use agent wallet address for trades

## Resources

- [Base Documentation](https://docs.base.org)
- [Next.js Documentation](https://nextjs.org/docs)
- [Fastify Documentation](https://www.fastify.io/docs)
- [Foundry Book](https://book.getfoundry.sh)
- [Wagmi Documentation](https://wagmi.sh)

## Common Tasks

### Adding a New API Endpoint
1. Define Zod schema in `backend/src/types/`
2. Create route handler in `backend/src/routes/`
3. Register route in `backend/src/index.ts`
4. Add TypeScript types for frontend
5. Update API documentation

### Creating a New Component
1. Create file in `frontend/src/components/`
2. Use TypeScript with proper prop types
3. Apply Tailwind classes for styling
4. Export as default or named export
5. Import where needed

### Deploying Contracts
1. Test thoroughly with `forge test -vvv`
2. Deploy to Sepolia testnet first
3. Verify contract on BaseScan
4. Test end-to-end on testnet
5. Deploy to mainnet (immutable!)

## Important Notes

- **Immutable Contracts**: Once deployed to mainnet, contracts cannot be changed
- **Test Before Deploy**: Always test on Sepolia before mainnet
- **Security First**: All code should be reviewed for security vulnerabilities
- **User Experience**: Keep the spectator experience simple and engaging
- **Performance**: Optimize for fast load times and smooth real-time updates
