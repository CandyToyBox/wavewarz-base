# WaveWarZ Base - Always-On Entry Queue (v1)

Self-contained context for the always-on protocol build. If you cloned this repo
and want to understand or resume the entry-queue work, start here.

Status as of 2026-06-14: **PARKED**, waiting on collaborator feedback. Lands on
branch `ws/v1-entry-queue` as a **draft** PR (#9). Do not merge until the testnet
dry run passes with real secrets.

---

## The idea

Turn WaveWarZ from a live-only nightly event into an **always-on protocol with a
settlement heartbeat**:

- A long-open **entry queue** (~23h). Anyone, any time, listens to the songs and
  places a **pick** on the side they think wins. Picks are *commitments* -
  nothing moves on-chain during the queue.
- One short **live Quick Battle** at the end (~10 min) that resolves on **trading
  dominance** (the WaveWarZ chart).
- Two ways to play: show up at battle time and trade live, or let your **AI agent
  ride it** whether you show up or not. Humans can **override** their agent.
- The event becomes the clock, not the whole thing. WaveWarZ becomes the
  always-on FAN/PLAYER door into The ZAO ecosystem (ZABAL Games is the parallel
  BUILDER door).

Free-form live execution: a pick is a commitment + a budget ceiling, not a
pre-priced buy. During the 10-min window each actor deploys their budget however
they want - all at open, dribble, or snipe at the close. The contract allows
arbitrary trading up to `endTime`, so a late flip is intended (that IS trading
dominance).

---

## Key finding: zero contract changes

The existing audited `WaveWarzBase` contract already expresses the entire v1
model. No Solidity changes were needed.

- `initializeBattle(params)` is permissionless; the orchestrator creates the
  battle with `startTime` + `battleDuration`.
- `buyShares(battleId, artistA, ...)` is **open-access** (any agent or human
  wallet) and **bounded to `[startTime, endTime]`**. Set `startTime` to the END
  of the queue window and the contract **physically blocks trading during the
  ~23h queue** - "nothing moves during the queue" is enforced on-chain for free.
- `endBattle(battleId, winnerIsArtistA)` settles on pool dominance; the
  orchestrator computes the winner from `artistAPool` vs `artistBPool`.
- `claimShares` does payout + the loser-pool refund. That refund **is** the
  "play both sides" safety - nothing extra to build, and it is NOT arb / two-sided
  market-making.

So the build is purely app-layer on top of a clean, audited base. No fork, no new
repo, no new contracts.

---

## Architecture

```
Admin opens a cycle
        |
        v
Audius pull  ---->  entry_cycles (status=open)   ~23h queue window
        |                  |
        |          picks (commitments) via POST /api/entry/bet
        |          - humans: wallet
        |          - agents: x402 402-handshake
        v                  |
queue window closes (tick) |
        v                  v
initializeBattle  ---->  status=live  (~10-min Quick Battle window)
        |
        |  agents w/ autonomy=agent: budget deployed at live-open via TradeExecutor
        |  humans (autonomy=self) + agent engine: trade live within budget
        v
battle window closes (tick)
        v
read pools -> winner = dominance -> endBattle -> status=settled -> claimShares
```

State machine: `open -> locked -> live -> settled` (or `cancelled`).
Driven by an in-process ticker (`ENTRY_TICK_INTERVAL_MS`) or by a cron hitting
`POST /api/entry/tick`.

---

## What's in the repo (file map)

Backend:
- `backend/supabase/migrations/008_entry_queue.sql` - `entry_cycles` + `entry_picks`
  tables. Picks are commitments (side + budget + actor + autonomy), not on-chain
  buys. Distinct from `battle_queue` (migration 002 = agent-vs-agent matchmaking).
- `backend/src/services/audius.service.ts` - sources the battle pair from the
  Audius public catalog (replaces SUNO as the song source). Real client +
  `MockAudiusService` for dry runs.
- `backend/src/services/entry-cycle.service.ts` - the state machine. Opens cycles,
  accepts picks, fires `initializeBattle`, deploys agent commitments at live-open
  via the existing `TradeExecutor`, resolves on dominance via `endBattle`. Enforces
  the per-actor budget cap; human override stands the controlled agent down.
- `backend/src/routes/entry.ts` - `GET /api/entry` (status), `POST /api/entry/open`
  + `/tick` (admin), `POST /api/entry/bet`. The bet endpoint is the **x402 agent
  door**: an `agent` pick with no `X-PAYMENT` header gets a `402` with
  `x-payment-required`; on retry with the header the settlement proof is recorded.
- `backend/src/index.ts` - service wiring + the tick loop.
- `backend/src/types/index.ts` - `AudiusTrack`, `EntryCycle`, `EntryPick`, etc.
- `backend/.env.example` - all config knobs (see below).

Frontend:
- `frontend/src/app/entry/page.tsx` - thin `/entry` page (distinct from `/queue`
  matchmaking). Cycle status, countdown, the two songs, committed-budget split,
  and a pick form (side, wallet, budget, "let my agent ride" vs "I'll trade live"
  + optional agent override).
- `frontend/src/lib/api.ts` - `getEntryCycle` + `placeEntryBet` client functions.

Scripts:
- `backend/scripts/entry-dry-run.mjs` - drives a full cycle against a running
  testnet backend (open -> human pick -> agent x402 pick -> live -> settle). Holds
  no secrets; talks to the API only. Its header documents usage in full.

Both frontend and backend `npm run typecheck` clean.

---

## Config knobs (backend/.env.example)

| Var | Default | Meaning |
|---|---|---|
| `BATTLES_PER_CYCLE` | 1 | Battles per cycle (v1 = 1; raise to source more Audius pairs) |
| `QUEUE_WINDOW_SECONDS` | 82800 | Queue open window (~23h; use a small value for dry runs) |
| `BATTLE_DURATION_SECONDS` | 600 | Live Quick Battle duration (10 min) |
| `AGENT_MAX_BUDGET_WEI` | 0.01 ETH | Per-actor per-battle budget cap (testnet safety) |
| `ENTRY_ARTIST_A_WALLET` / `_B_` | WAVEWARZ_WALLET | Fee-sink wallets per side (v1 placeholders) |
| `ENTRY_PAYMENT_TOKEN` | zero addr | Battle payment token (zero = ETH, testnet default) |
| `ENTRY_X402_FEE_WEI` | 0.0001 ETH | x402 entry fee to place an agent pick |
| `X402_NETWORK` | base-sepolia | Network advertised in 402 responses |
| `AUDIUS_APP_NAME` | wavewarz | Audius app_name for catalog reads (no key needed) |
| `ENTRY_TICK_INTERVAL_MS` | 15000 | In-process tick interval (or use the cron + /tick) |

---

## What's done vs left

Done (Steps 0-6 code):
- Step 0 config knobs, Step 1 Audius source, Step 2 entry-queue tables + service,
  Step 3 x402 bet route, Step 4 orchestration, Step 5 `/entry` UI, Step 6 dry-run
  script. Zero contract changes. Typechecks clean.

Left:
- **The on-chain testnet dry run** (the real proof) - needs secrets (below).
- **x402 payment verification** - v1 records the proof txHash but does NOT yet
  verify it landed on-chain. Mainnet blocker; fine for testnet.
- Optionally promote PR #9 out of draft once the dry run passes.

---

## Running the testnet dry run

The backend it targets must already be configured (real secrets - handle outside
version control, in your `.env` / secrets vault):

| Input | What |
|---|---|
| `DATABASE_URL` | Supabase Postgres conn string, migrations 001-008 applied |
| `ADMIN_PRIVATE_KEY` | Admin signer; funded with Base Sepolia ETH for gas (initializeBattle/endBattle) |
| `WAVEX_PRIVATE_KEY` | One funded agent wallet (agent `wavex-001`); needs Sepolia ETH >= bet budget + gas |
| `ADMIN_API_KEY` | Any chosen string; gates `/open` and `/tick` |
| `WAVEWARZ_WALLET_ADDRESS` | Platform / fee wallet address |
| `BASE_RPC_URL` | Base Sepolia RPC (`https://sepolia.base.org` or your provider URL) |
| `NODE_ENV=production` | Use the real Audius source (dev = mock songs) |
| `QUEUE_WINDOW_SECONDS` / `BATTLE_DURATION_SECONDS` | Set small (e.g. 60 / 120) for a fast run |

Known, no need to supply: contract address
`0xa4B10AF81E3ED591A5d5b1D621bB6B76C9D4CA43` (see `deployments.json`), chain 84532.
`AGENT_X402_TXHASH` placeholder is fine (not verified in v1).

Then, with the backend running:

```
API_URL=http://localhost:3001 ADMIN_API_KEY=... \
HUMAN_WALLET=0x... AGENT_ID=wavex-001 \
node backend/scripts/entry-dry-run.mjs
```

Watch the backend logs for the on-chain tx hashes (initializeBattle / buyShares /
endBattle). That sequence is the proof the slice runs end to end on testnet.

---

## Open design questions (for when the brief commits to specifics)

These are intentionally unresolved in v1 - flag before promising specifics:

1. **Liquidity for "play both sides."** v1 uses the existing loser-pool refund, NOT
   arb / two-sided market-making. Do not build or imply arb.
2. **24h price path vs the 10-min settlement.** Nothing moves during the queue by
   design; the curve only lives in the live window.
3. **Agent autonomy bounds.** Bankroll/per-battle caps (v1 default 0.01 testnet
   ETH), strategy templates, custody.
4. **Song sourcing at scale.** 1 pair/day in v1 via Audius trending; raising the
   count + rights/licensing is a mainnet concern.
5. **Chain.** v1 is Base. Cross-chain identity / dual-chain royalties (Solana live
   roster <-> Base agentic) is deferred.

---

## Related

- Public co-founder brief: `github.com/bettercallzaal/wwbase` (the why + honest gaps).
- This repo: `github.com/CandyToyBox/wavewarz-base`, branch `ws/v1-entry-queue`.
- Concept source of record: ZAOOS research doc 854.
