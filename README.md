# WaveWarz Base Sepolia Trading Suite

Complete agent trading workflow for WaveWarz battles on Base Sepolia (L2 testnet).

---

## Network Configuration

**Network**: Base Sepolia (Ethereum L2 Testnet)
**Chain ID**: 84532
**RPC**: `https://api.developer.coinbase.com/rpc/v1/base-sepolia/CbtDE4lSp9Zxibzvz3rAkSF9MfKzYUbc`
**Explorer**: https://sepolia.basescan.org/
**Contract**: `0xe28709DF5c77eD096f386510240A4118848c1098`

---

## Agent Wallets

| Agent | Address | Balance | Status |
|-------|---------|---------|--------|
| **lil_lob** | `0xCB22D1D13665B99F8f140f4047BCB73872982E77` | 0.004-0.008 ETH | ✅ Funded |
| **candy_cookz** | `0x1C077ca097B99FE953Bdf8Dcc871C276dD7aDb11` | 0.004-0.008 ETH | ✅ Funded |
| **merch** | `0x2EAF14adAA4d32A0cd807bC15A40c3A93FA68c30` | 0.004-0.008 ETH | ✅ Funded |

---

## Trading Workflow

### Phase 1: Contract Verification ✅
```bash
node test-battles.js
```
Verifies that:
- Smart contract is deployed on Base Sepolia
- Contract code exists (27,572 bytes)
- All three agent wallets are funded
- Contract is responsive to read calls

**Output**: Contract verification report + wallet balance summary

---

### Phase 2: Battle Setup

#### Option A: Create New Battle (Admin Only)
```bash
node create-first-battle.js
```
Generates transaction data to initialize a new battle with:
- Battle ID: 1
- Duration: 5 minutes
- Artists: lil_lob vs candy_cookz
- Payment Token: ETH

Then manually execute via Basescan:
https://sepolia.basescan.org/address/0xe28709DF5c77eD096f386510240A4118848c1098#writeContract

**Or**: Use an existing active battle (Battle 1 is already active)

---

### Phase 3: Execute Trades

#### Generate Trade Transactions
```bash
node execute-trades.js
```
Outputs encoded transaction data for:
1. **lil_lob** buys Artist A shares (0.001 ETH)
2. **candy_cookz** buys Artist B shares (0.001 ETH)

**Current Battle Status**:
- Battle ID: 1
- Status: 🟢 ACTIVE
- Start Time: ~30 seconds from now
- Duration: 5 minutes (300 seconds)

#### Execute via Basescan
1. Open: https://sepolia.basescan.org/address/0xe28709DF5c77eD096f386510240A4118848c1098#writeContract
2. **lil_lob** wallet:
   - Connect `0xCB22D1D13665B99F8f140f4047BCB73872982E77`
   - Find `buyShares` function
   - Paste encoded data from script
   - Set value: `0.001 ETH`
   - Submit transaction

3. **candy_cookz** wallet:
   - Connect `0x1C077ca097B99FE953Bdf8Dcc871C276dD7aDb11`
   - Find `buyShares` function
   - Paste encoded data from script
   - Set value: `0.001 ETH`
   - Submit transaction

**Wait for both transactions to confirm (typically 12-30 seconds)**

---

### Phase 4: Monitor Battle

```bash
node monitor-battle.js
```
Continuously monitors battle status:
- Current pool sizes (Artist A vs B)
- Time remaining
- Token supplies
- Winner announcement (when decided)

Polls every 5 seconds for up to 10 minutes (configurable).

**Output**: Real-time battle status with settlement signals

---

### Phase 5: Claim Payouts

```bash
node claim-shares.js
```
Generates claim transactions once battle settles.

Shows:
- Current pool states
- Expected payout calculations
- Encoded claimShares function calls

#### Execute Claims via Basescan
1. **lil_lob** wallet:
   - Connect to Basescan
   - Find `claimShares` function
   - Paste encoded data
   - Submit transaction

2. **candy_cookz** wallet:
   - Connect to Basescan
   - Find `claimShares` function
   - Paste encoded data
   - Submit transaction

**Wait for both transactions to confirm**

---

### Phase 6: Track P&L

```bash
node track-pl.js
```
Analyzes final battle outcome and records P&L:
- Buy-in amount (0.001 ETH)
- Payout amount (calculated from pool states)
- Profit/Loss (P&L)
- Return on Investment (ROI)

Automatically appends to agent memory logs:
```
~/.openclaw/workspace-lil_lob/memory/YYYY-MM-DD.md
~/.openclaw/workspace-candy_cookz/memory/YYYY-MM-DD.md
```

---

## Script Reference

### test-battles.js
Verifies contract deployment and agent funding.
```bash
node test-battles.js
```
✅ Quick verification (2-3 seconds)

### create-first-battle.js
Generates battle creation transaction data.
```bash
node create-first-battle.js
```
📝 Output: Encoded initializeBattle data

### execute-trades.js
Generates buy share transactions for agents.
```bash
node execute-trades.js
```
📝 Output: Encoded buyShares data (2 transactions)

### monitor-battle.js
Polls battle status until settlement.
```bash
node monitor-battle.js
```
⏳ Runs continuously (configurable 5-600 seconds)

### claim-shares.js
Generates claim share transactions after settlement.
```bash
node claim-shares.js
```
📝 Output: Encoded claimShares data (2 transactions)
💰 Shows expected payouts before claiming

### track-pl.js
Analyzes outcomes and records P&L to memory logs.
```bash
node track-pl.js
```
📊 Output: P&L summary + agent memory logs updated

---

## Full Workflow Timeline

```
[0s]   Run test-battles.js → Verify contract ✅
       ↓
[30s]  Run execute-trades.js → Generate trade data
       ↓
[1m]   Manually execute lil_lob buy transaction via Basescan
       ↓
[2m]   Manually execute candy_cookz buy transaction via Basescan
       ↓
[3m]   Wait for transactions to confirm (~30s)
       ↓
[4m]   Run monitor-battle.js → Watch pools grow in real-time
       ↓
[5m]   Battle ends automatically
       ↓
[6m]   Run claim-shares.js → Generate claim transactions
       ↓
[7m]   Manually execute lil_lob claim via Basescan
       ↓
[8m]   Manually execute candy_cookz claim via Basescan
       ↓
[9m]   Wait for claim transactions to confirm
       ↓
[10m]  Run track-pl.js → Record P&L to memory logs
       ↓
✅ Battle cycle complete!
```

**Total Time: ~10 minutes per battle**

---

## Expected Outcomes

### Pool Growth (Example)
```
Initial:  Artist A: 0.000 ETH | Artist B: 0.000 ETH
After trades: Artist A: 0.001 ETH | Artist B: 0.001 ETH
Final:    Artist A: 0.002+ ETH | Artist B: 0.002+ ETH
          (includes trading fees and price impact)
```

### Payout Distribution (50/50 Token Holdings)
```
Winner Trader:  ~0.002 ETH payout (100% ROI)
Loser Trader:   ~0.0005 ETH payout (-50% loss recovery)
Winning Artist: Automatic SOL payout
Losing Artist:  Automatic SOL payout
Platform:       3% settlement fee
```

---

## Common Issues & Fixes

### ❌ "Contract NOT deployed"
- Verify address: `0xe28709DF5c77eD096f386510240A4118848c1098`
- Check RPC endpoint is correct
- Ensure you're on Base Sepolia (Chain ID: 84532)

### ❌ "Battle not found"
- Battle may not be initialized yet
- Run `create-first-battle.js` to create one
- Or wait for an active battle to be created

### ❌ "Insufficient funds"
- Check wallet balance: `node test-battles.js`
- Request funds from Base Sepolia faucet if < 0.001 ETH
- Public faucet: https://www.alchemy.com/faucets/base-sepolia

### ❌ "Transaction failed on Basescan"
- Check gas price (typically 1-2 Gwei on Base Sepolia)
- Ensure correct encoded data is pasted
- Verify wallet has > 0.001 ETH for trades

### ❌ "No trades detected in claim"
- Buy transactions may not have confirmed yet
- Wait 30-60 seconds for confirmation
- Check transaction hash on Basescan

---

## Monitoring & Analytics

### Real-Time Pool Growth
```bash
node monitor-battle.js
# Output updates every 5 seconds showing:
# - Pool A: 0.001 ETH | Pool B: 0.001 ETH
# - Time remaining: 240 seconds
# - Supply A: 100000 tokens | Supply B: 100000 tokens
```

### Agent Performance Tracking
Each agent's memory log records:
```markdown
### Battle #1
- Buy In: 0.001 ETH
- Payout: 0.002 ETH
- P&L: +0.001 ETH
- ROI: +100%
```

---

## Next Steps

1. ✅ Run `test-battles.js` (verify setup)
2. ✅ Run `execute-trades.js` (get transaction data)
3. 📝 Execute trades manually via Basescan (2 transactions)
4. ⏳ Run `monitor-battle.js` (watch battle progress)
5. 📊 Run `claim-shares.js` (get claim transactions)
6. 📝 Execute claims manually via Basescan (2 transactions)
7. 📈 Run `track-pl.js` (record outcomes)
8. 🔄 Repeat for multiple test battles (3+ recommended)

---

## Support

For issues or questions:
1. Check this README first
2. Review Basescan contract: https://sepolia.basescan.org/address/0xe28709DF5c77eD096f386510240A4118848c1098
3. Check agent memory logs for historical data
4. Review error messages in script output

---

**Version**: 1.0
**Last Updated**: February 2026
**Status**: ✅ Ready for Live Testing
