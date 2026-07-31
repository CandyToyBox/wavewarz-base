[README.md](https://github.com/user-attachments/files/30585482/README.md)
# 🎵 WaveWarz Dynamic NFT System

**SVM-compatible | Metaplex | Audius | txtx**

A fully on-chain dynamic NFT platform for live WaveWarz music battles on Solana.
NFTs adapt their price, visual phase, and metadata in real-time based on Audius stream counts and fan votes — and pay artists **1–10% royalties** on every secondary sale.

---

## Architecture

```
wavewarz_dynamic_nft/
├── programs/wavewarz/src/lib.rs   ← Anchor/SVM smart contract
├── oracle/
│   ├── audius_oracle.ts           ← Audius stream poller + on-chain pusher
│   └── metadata_server.ts         ← Dynamic metadata JSON API
├── txtx/wavewarz.tx               ← txtx deploy runbook
├── Anchor.toml
└── README.md
```

---

## Smart Contract Features

| Feature | Detail |
|---|---|
| **SVM Compatible** | Anchor 0.29 / Solana 1.18 |
| **Metaplex NFTs** | Minted with dynamic `sellerFeeBasisPoints` (royalties) |
| **Audius Integration** | Oracle reads live stream counts → pushed on-chain |
| **Dynamic Pricing** | Price = base × stream_boost × vote_multiplier |
| **Artist Royalties** | 1%–10% (100–1000 bps) on every secondary trade |
| **Platform Fee** | 2.5% on trades |
| **Battle Phases** | Live → Heating → Dominating → Won/Lost |
| **Winner Bonus** | Winning side NFTs get +20% price boost |

---

## Dynamic Price Formula

```
stream_boost      = (side_streams / total_streams) × 10000 bps
vote_multiplier   = 9000 + (vote_share × 0.6) bps  [0.9× – 1.5×]

new_price = base_price
            × (10000 + stream_boost) / 10000
            × vote_multiplier / 10000
```

---

## Battle Lifecycle

```
create_battle()         → sets artists, Audius track IDs, royalties, timing
    ↓
mint_battle_nft()       → fans mint NFTs backing their artist
    ↓ (every 30s)
update_stream_data()    → Audius oracle pushes live stream counts
adapt_nft_price()       → prices auto-adjust based on stream momentum
update_metadata_uri()   → visual phase updates (Live/Heating/Dominating)
    ↓
cast_vote()             → fans vote to influence score
    ↓
end_battle()            → winner declared (60% streams + 40% votes)
claim_winner_bonus()    → winning NFTs get +20% price premium
```

---

## Royalty System

Royalties are enforced **at the smart contract level** on every `trade_nft()` call:

```
sale_price = royalty_to_artist + platform_fee + seller_proceeds

royalty_to_artist = sale_price × royalty_bps / 10000  (1%–10%)
platform_fee      = sale_price × 250 / 10000          (2.5%)
seller_proceeds   = remainder
```

Royalties are set per-battle per-artist at battle creation and stored in each NFT's state account, so they cannot be bypassed.

---

## Setup & Deploy

### 1. Prerequisites
```bash
# Install Solana, Anchor, txtx
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked
npm install -g @txtx/cli
```

### 2. Environment Variables
```env
SOLANA_RPC_URL=https://api.devnet.solana.com
DEPLOYER_KEYPAIR_PATH=~/.config/solana/id.json
ORACLE_KEYPAIR_PATH=./oracle-keypair.json
AUDIUS_ORACLE_PUBKEY=<oracle wallet pubkey>
AUDIUS_API_KEY=<your Audius API key>
AUDIUS_API_SECRET=<your Audius API secret>
PLATFORM_WALLET_PUBKEY=<platform treasury>
PROGRAM_ID=WVWZdynNFT111111111111111111111111111111111
METADATA_API_URL=https://your-metadata-api.com
```

### 3. Build & Deploy
```bash
# Build Anchor program
anchor build

# Deploy with txtx (handles program deploy + config init)
txtx run txtx/wavewarz.tx

# Start Audius oracle
npm run oracle

# Start metadata API
npm run meta
```

### 4. Create a Battle
```typescript
await program.methods.createBattle(
  new BN(1),                          // battle_id
  artistAPublicKey,
  artistBPublicKey,
  "audius:track:123456",              // Audius track ID A
  "audius:track:789012",              // Audius track ID B
  new BN(startTimestamp),
  new BN(endTimestamp),
  500,                                // royalty_bps_a = 5%
  300,                                // royalty_bps_b = 3%
).rpc();
```

---

## Metaplex Integration

NFT metadata follows the Metaplex standard with WaveWarz-specific extensions:

```json
{
  "name": "WaveWarz Battle #1 – Artist A [HEATING]",
  "symbol": "WWARZ",
  "seller_fee_basis_points": 500,
  "attributes": [
    { "trait_type": "Battle Phase", "value": "Heating" },
    { "trait_type": "Audius Streams", "value": 142857 },
    { "trait_type": "Royalty", "value": "5%" }
  ],
  "wavewarz": {
    "battle_id": 1,
    "side": "a",
    "phase": "heating",
    "audius_track_id": "123456",
    "live_battle_url": "https://wavewarz.com/battle/1",
    "royalty_pct": 5
  }
}
```

---

## Security Notes

- Oracle is authenticated via public key stored in `ProgramConfig`
- Royalties are enforced in smart contract, not just metadata
- Vote manipulation prevented by one-vote-per-wallet PDA guard
- Price update has a 60-second cooldown to prevent spam
- All PDAs use canonical bump seeds

---

*Built for WaveWarz.com | Powered by Solana SVM, Anchor, Metaplex & Audius*
