# WaveWarz Base — Builder's Brief

**If you're reading this, you found the repo. Here's the state of things, what's open, and what we're looking for.**

A respectful note up front: this repo is built by Samantha (`@candytoybox`) with contracts and PM by Ikechi (`@hurric4n3ike`). WaveWarz Solana is their live product on Solana mainnet — real artists, real revenue, running nightly. WaveWarz Base is the agentic spinout deployed on Base Sepolia. This brief is an open invitation to the right technical co-founder to come help us take Base to mainnet and beyond.

---

## What WaveWarz is, mechanically

A music battle platform. Two artists go head-to-head. Fans buy in by trading per-battle ephemeral tokens on a bonding curve. Artists earn instantly from every trade. The battle settles on a fixed timer and pays out winners + losers from on-chain pools.

| | |
|---|---|
| **Live product** | Solana mainnet — WaveWarz |
| **This codebase** | Base L2, agentic version, currently on Sepolia testnet |
| **Token model** | Per-battle `EphemeralBattleToken` — one ERC-20 spun up per battle, settled at battle end |
| **Pricing** | Bonding-curve marketplace contract |
| **Fees per trade** | 1% to artist (instant), 0.5% to platform, 98.5% stays in ecosystem |
| **Settlement** | 50% loser-pool refund / 40% winner-pool bonus / 5% winning artist / 2% losing artist / 3% platform |
| **Battle types** | Main events (20+ min, 2/3 vote), Quick Battles (6-9 min, chart-based), Community |

For deep mechanics, see `README.md` and `BATTLE-LIFECYCLE-SUMMARY.md` in this repo.

---

## Production proof — WaveWarz Solana

Before reading any pitch on Base, look at the live numbers on Solana. The mechanics are not theoretical.

- **735 battles** executed (126 main events + 578 quick battles)
- **472.71 SOL volume** (~$37,800 in real fan trading)
- **7.96 SOL** paid directly to artists in instant on-chain payouts
- Live nightly quick-battles at **8:30 PM ET** on YouTube + X Spaces
- Real artists battling: dopestilo, luiwrites, Kata7yst, CannonJones973, others
- Charity battle raised $270+ for PolyRaiders (Nigerian girl-child education)
- Live stats: [wavewarz.info](https://wavewarz.info)

The Base build is the agentic sibling of this. AI agents as the artists. Same engine, new chain, new product surface.

---

## What's deployed on Base (this repo)

**Smart contracts** — Base Sepolia (chain 84532), verified Feb 21, 2026:

| Contract | Address |
|---|---|
| `WaveWarzBase` | `0xa4B10AF81E3ED591A5d5b1D621bB6B76C9D4CA43` |
| `WaveWarzMusicNFT` | `0x813c13d534660E85E37ee71bd3595724FC9D782A` |
| `WaveWarzMarketplace` | `0x227a3B842d8692a5bB961395f301Eff83B0499F5` |

Solidity 0.8.20, OpenZeppelin, ReentrancyGuard, EIP-2981 royalties on the NFT, comprehensive Foundry test suite passing.

**Application stack:**

- **Frontend** (`frontend/`): Next.js 14, OnchainKit, Wagmi, Recharts, Socket.io. Pages: Homepage, Battles, Dashboard, Leaderboard, Marketplace. Broadcast-terminal aesthetic.
- **Backend** (`backend/`): Fastify 4.25 + Supabase + WebSocket. Battle state, trade execution, real-time feeds.
- **Trading brain** (`agent/`): Python + FastAPI + Anthropic Claude. Triggered every 5 min via GitHub Actions. Produces TradeIntent JSON.
- **Trade executors**: Node + Express. Base via 0x Protocol. Solana via Jupiter v6. `@coinbase/x402` v2.1 micropayment rails wired in.
- **Database**: Supabase PostgreSQL. Battle history, trade logs, agent profiles, leaderboard.

For setup, see `README.md`, `DEPLOYMENT.md`, and `COINBASE-CDP-V2-MIGRATION.md`.

---

## What's open — the canvas

The contracts and infrastructure are deployed. What's wide open and waiting for a technical principal:

1. **Mainnet deployment.** Contracts are ready. Needs a principled go-live (incremental deploy, monitoring, kill-switches).
2. **Agent battle choreography.** How AI agents initiate, trade, and settle battles programmatically. This is the core product mechanic and is genuinely undefined. The most interesting open problem.
3. **Scale architecture.** Current cap is one concurrent battle. Designing for many parallel battles is a real structural decision (sharding, queueing, settlement order).
4. **x402 monetization.** Rails are wired into Executor-Base but not activated. Pricing model open.
5. **Real-artist integration.** Connecting Base battles back to the Solana artist roster — cross-chain identity, dual-chain royalties.
6. **Agent economy design.** Multiple AI artists battling creates emergent token dynamics. Worth thinking about as a system.

This is principal-level work. Not cleanup.

---

## Who's already on it

- **Samantha Kinney** (`@candytoybox`) — co-founder, built the application stack, runs WaveWarz Solana day-to-day. Solana is her anchor; stays as Solana lead.
- **Ikechi Nwachukwu** (`@hurric4n3ike`) — founder, project manager, contracts. Also a featured WaveWarz artist (HURRICANE3IKE). Other Solidity work: [`hurric4n3ike/zoundz`](https://github.com/hurric4n3ike/zoundz) — 1/1 music NFT marketplace on Base with English auctions.
- **Zaal Panthaki** (`@bettercallzaal` / `@zaal`) — comms, partnerships, community, distribution. The ZAO ecosystem (1,000+ participants, $8K+ revenue across deployed contracts on Base and Solana). COC Concertz (5 concerts produced). ZAO Stock festival launching Oct 3, 2026 in Ellsworth, Maine. BCZ YapZ podcast (18+ eps). 5K Farcaster, 4.9K X, 107 events hosted.

**Open seat:** technical co-founder for the Base spinout. Owns the build going forward.

---

## Honest gaps

We won't hide debt. If you're going to inherit this, you should see it clearly.

- **Dormant since Feb 27, 2026.** The structural reason is real: an attempted hand-off to an in-repo AI-agent owner (see `HANDOFF_TO_LIL_LOB.md`) didn't complete. The platform is shovel-ready for a human technical owner.
- **Contracts verified on GitHub but not yet on BaseScan.** First task.
- **Secrets historically lived in `.env` files.** Migrate to a real secrets vault (1Password Secrets Automation, Doppler, AWS Secrets Manager) before any further external collaboration. Note: previous credentials in this repo's documentation are being rotated.
- **No monitoring / alerting / backups.** Standard ops gap.
- **`README.md` references an older contract address.** The addresses in the table above are current.
- **One previously compromised wallet** (March 2026) — funds moved, retired, not in use. Documented for transparency.

None are structural. All are scoped to days, not months.

---

## Why now, on Base

The macro context for taking this to mainnet right now:

- **Base founder thesis (April 25, 2026):** Jesse Pollak: "AI agents are the next big wave for crypto payments."
- **x402 micropayments:** $48M cumulative volume, 95% on Base. Infrastructure live.
- **Clanker:** Hit $8M/week in protocol fees at peak. Token-deployment infra for agents is mainstream on Base.
- **Trader.ai (April 27, 2026):** Launched a 40-agent trading arena. Agent-vs-agent competition is the live narrative.
- **Virtuals Protocol:** $477.57M aGDP across 15,800+ agent projects. The agent economy is at scale.
- **AIXBT ($636M) and Luna ($166M)** market caps prove agent tokens have PMF post the 75% sector correction.
- **Coinbase Agentic Wallets + AgentKit** (Feb 2026) make agent UX practical.

What we'd push back on: "music NFTs" as a category — cooled. WaveWarz Base isn't a music NFT project. It's an agent competition platform that happens to settle in music-themed ephemeral tokens.

The intersection — agentic competition + music + Base infrastructure — is white space.

---

## The shape of what we're offering

Co-founder seat. Equity, technical principal, you own the Base build and technical direction. Samantha stays on Solana. Ikechi stays on contracts. Zaal runs distribution and community. The Base technical seat is the open seat.

This is a co-build, not a job spec. Deal shape is open and we want to design it with the right person.

---

## A note on the kind of builder we want

Someone who has shipped real on-chain product, has thought about agent-driven economies as more than a meme, believes in artists owning their economics, wants to design a system not just maintain one, and is okay with a co-build rather than going solo.

On the BetterCallZaal YapZ podcast on April 21, 2026, one of the builders we'd most want to talk to said this:

> "I wanna help create music. Cards for our artists within our org, where like we can leverage not only creating, uh, like the lore of a trading card, but having it be tied to an actual person as opposed to just fantasy characters. And I think that could be really valuable, kind of like sports cards, but being able to leverage Web3 technology of like, okay, anytime someone buys this card or potentially plays it in the future, you can send that royalty to all of the artists that are on that song."

If that describes how you think about the intersection of music, agents, and on-chain economics, we should talk.

---

## How to get involved

- Zaal — Farcaster `@zaal`, X `@bettercallzaal`, email zaalp99@gmail.com
- Samantha — Farcaster `@candytoybox`
- Ikechi — Farcaster `@hurric4n3ike`

Live Solana product: [wavewarz.com](https://wavewarz.com) · live stats: [wavewarz.info](https://wavewarz.info)
ZAO Stock festival: October 3, 2026, Ellsworth, Maine

A 20-minute call is worth it.

---

*Not a deck. A platform.*
