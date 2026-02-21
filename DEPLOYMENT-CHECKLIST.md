# 🚀 WaveWarz Base - Deployment Checklist

**Status**: ✅ Ready for Production Deployment  
**Last Updated**: February 21, 2026  
**SDK Version**: Coinbase CDP v2 (Latest)

---

## Pre-Deployment Verification

### ✅ Environment Setup
- [x] `.env` file created with Coinbase CDP credentials
  - `CDP_API_KEY_ID` - Coinbase portal API key identifier
  - `CDP_API_KEY_SECRET` - EC private key for API signing
  - `CDP_WALLET_SECRET` - Server wallet encryption secret
- [x] File: `/Users/samanthakinney/wavewarz-base/.env`

### ✅ Smart Contracts
- [x] `contracts/src/WaveWarzBase.sol` - Main battle contract (22.5 KB)
- [x] `contracts/src/IWaveWarzBase.sol` - Interface definition (3.0 KB)
- [x] `contracts/src/EphemeralBattleToken.sol` - Ephemeral token implementation (1.9 KB)
- [x] `contracts/src/WaveWarzMarketplace.sol` - Marketplace contract (14.4 KB)
- [x] `contracts/src/WaveWarzMusicNFT.sol` - Music NFT contract (6.7 KB)

### ✅ Compiler Input
- [x] `contract-compiler-input.json` - Foundry standardJson output (76 lines)
  - 11 source files included (WaveWarz + OpenZeppelin dependencies)
  - Language: Solidity
  - Compiler settings: optimizer enabled (200 runs)
  - All required imports resolved

### ✅ Deployment Script
- [x] `deploy-with-cdp-v2.js` - Production deployment script
  - Uses official Coinbase CDP v2 `wallet.deployContract()` API
  - Syntax validated ✓
  - Path references verified ✓
  - Error handling implemented ✓

### ✅ Dependencies
- [x] `@coinbase/coinbase-sdk` v0.25.0 - Official Coinbase SDK
- [x] `dotenv` v17.3.1 - Environment variable management
- [x] `ethers` v6.16.0 - Ethereum utilities
- [x] All packages installed: `npm install` ✓

---

## Deployment Workflow

### Option 1: Web Dashboard (Easiest)
```bash
# 1. Navigate to Coinbase CDP Dashboard
https://portal.cdp.coinbase.com/

# 2. Go to "Send Transaction"
# 3. Configure:
#    - Network: Base Sepolia (Chain ID 84532)
#    - To: Contract address (will be generated)
#    - Data: Deployment bytecode
# 4. Review and confirm transaction
```

### Option 2: Node.js + CDP v2 SDK (Recommended for Automation)
```bash
# 1. Install dependencies
npm install

# 2. Deploy using CDP v2 script
node deploy-with-cdp-v2.js

# 3. Monitor deployment
# - Watch transaction hash in terminal
# - Check Basescan for confirmation
# - Verify contract at: https://sepolia.basescan.org
```

### Option 3: Cast CLI (If You Have Private Key)
```bash
# Export private key from wallet
export SIGNER_PRIVATE_KEY="0x..."

# Deploy via Cast
cast send 0x... "initializeBattle((uint64,uint64,uint64,address,address,address,address))" \
  "1002,3600,..." \
  --rpc-url https://sepolia.base.org \
  --private-key $SIGNER_PRIVATE_KEY
```

---

## Deployment Configuration

### Battle #1002 Parameters
```javascript
{
  battleId: 1002,
  battleDuration: 3600,                    // 1 hour in seconds
  startTime: Math.floor(Date.now() / 1000) + 120,  // 2 minutes from now

  // Participants
  artistA: "0xCB22D1D13665B99F8f140f4047BCB73872982E77",
  artistB: "0x1C077ca097B99FE953Bdf8Dcc871C276dD7aDb11",
  platform: "0x2EAF14adAA4d32A0cd807bC15A40c3A93FA68c30",

  // Payment Token (WETH on Base Sepolia)
  paymentToken: "0x4200000000000000000000000000000000000006"
}
```

### Network Configuration
```
Chain ID:           84532
Network:            Base Sepolia (Testnet)
RPC URL:            https://sepolia.base.org
Explorer:           https://sepolia.basescan.org
Status:             ✅ Healthy
```

---

## Post-Deployment Verification

### 1️⃣ Contract Deployment
```bash
# Check transaction receipt
cast receipt <TX_HASH> --rpc-url https://sepolia.base.org

# Verify contract address
# Expected: 0x... (from receipt)
```

### 2️⃣ Basescan Verification
```
Steps:
1. Visit https://sepolia.basescan.org/
2. Search for contract address
3. Go to "Contract" tab
4. Verify source code matches contracts/src/WaveWarzBase.sol
5. Check creation transaction and bytecode
```

### 3️⃣ Test Trades
```bash
# After deployment, execute test trades
node execute-trades-1002.js

# Verify:
# - Trading contract calls work
# - Bonding curve math correct
# - Fee distribution accurate
```

### 4️⃣ Fee Distribution
```bash
# Monitor artist/platform payouts
# Check wallet balances after battle settlement

Artist A Wallet:   0xCB22D1D13665B99F8f140f4047BCB73872982E77
Artist B Wallet:   0x1C077ca097B99FE953Bdf8Dcc871C276dD7aDb11
Platform Wallet:   0x2EAF14adAA4d32A0cd807bC15A40c3A93FA68c30
```

---

## Troubleshooting

### Error: "Missing scopes: [asset:write]"
**Cause**: API key doesn't have required permissions  
**Fix**: 
1. Go to https://portal.cdp.coinbase.com/projects/api-keys
2. Delete old API key
3. Create new API key (automatically includes all scopes)
4. Update .env with new credentials

### Error: "Invalid network"
**Cause**: Wrong `networkId` in `Wallet.create()`  
**Fix**: Use one of these:
- `"base-sepolia"` (testnet)
- `"base-mainnet"` (mainnet)
- `"ethereum-sepolia"` (Ethereum testnet)

### Error: "Contract source not found"
**Cause**: Missing contract in `solidityInputJson`  
**Fix**: Regenerate compiler input:
```bash
forge build
forge inspect WaveWarzBase standardJson > contract-compiler-input.json
```

### Error: Deployment timed out
**Cause**: Network congestion or insufficient gas  
**Fix**:
1. Wait 1-2 minutes and retry
2. Check Base Sepolia faucet: https://www.alchemy.com/faucets/base-sepolia
3. Increase gas limit in deploy script

---

## File Inventory

```
wavewarz-base/
├── ✅ .env                          (Credentials - 449 bytes)
├── ✅ .env.example                  (Template)
├── ✅ .gitignore                    (Version controlled)
├── ✅ README.md                     (Documentation)
├── ✅ CREDENTIALS_GUIDE.md          (Credential reference)
├── ✅ COINBASE-CDP-V2-MIGRATION.md  (Migration guide)
├── ✅ DEPLOYMENT-CHECKLIST.md       (This file)
├── ✅ package.json                  (Dependencies updated to v2)
├── ✅ package-lock.json             (Lockfile)
├── ✅ contract-compiler-input.json  (76 lines, 11 sources)
├── ✅ deploy-with-cdp-v2.js         (Production deployment script)
├── ✅ execute-trades-1002.js        (Test trading script)
├── contracts/
│   ├── src/
│   │   ├── WaveWarzBase.sol
│   │   ├── IWaveWarzBase.sol
│   │   ├── EphemeralBattleToken.sol
│   │   ├── WaveWarzMarketplace.sol
│   │   └── WaveWarzMusicNFT.sol
│   ├── test/
│   │   ├── WaveWarzBase.t.sol
│   │   ├── BondingCurve.t.sol
│   │   └── WaveWarzMusicNFT.t.sol
│   ├── lib/
│   │   ├── openzeppelin-contracts/
│   │   └── forge-std/
│   └── out/ (Forge build artifacts)
├── node_modules/ (npm dependencies)
└── .git/ (Version control)
```

---

## Security Checklist

- [x] .env file is `.gitignore`d (private credentials not in repo)
- [x] Private keys never logged or displayed
- [x] Contract uses ReentrancyGuard for reentrancy protection
- [x] SafeERC20 for token operations
- [x] Access control on admin functions
- [x] No infinite approvals
- [x] Compiler input validated
- [x] Dependencies up to date

---

## Migration Complete ✅

| Item | v1 (Deprecated) | v2 (Current) |
|------|---|---|
| SDK Package | @coinbase/cdp-sdk | @coinbase/coinbase-sdk |
| API Class | CdpClient | Wallet |
| Deployment | N/A | wallet.deployContract() |
| Contract Auth | Manual signing | Server-managed wallet |
| Status | ❌ Deprecated Feb 2, 2026 | ✅ Official & Supported |

---

## Next Steps

1. **Immediate**: Deploy Battle #1002 using `node deploy-with-cdp-v2.js`
2. **Verification**: Run test trades with `execute-trades-1002.js`
3. **Monitoring**: Check fee distribution on Basescan
4. **Production**: Switch to `base-mainnet` for real trading

---

**Documentation Status**: ✅ Complete  
**Deployment Ready**: ✅ Yes  
**Estimated Deployment Time**: 2-5 minutes  
**Support**: See README.md for troubleshooting

