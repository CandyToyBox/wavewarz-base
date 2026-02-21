# ⚠️ Coinbase CDP v1 → v2 Migration Guide

**CRITICAL**: Server Wallet v1 is **DEPRECATED as of February 2, 2026**. This guide explains the migration to CDP v2.

---

## What Changed?

### v1 (Deprecated) ❌
```javascript
// OLD: v1 patterns (no longer work)
const cdp = new CdpClient();
const account = await cdp.evm.getOrCreateAccount("account-name"); // ❌ Broken
```

**Problems with v1**:
- Unmaintained SDK
- `getOrCreateAccount()` method unstable
- No contract deployment support
- Poor error messages
- Server Wallet v1 shutting down Feb 2, 2026

### v2 (Current) ✅
```javascript
// NEW: v2 patterns (recommended)
const wallet = await Wallet.create({ networkId: "base-sepolia" });
const deployTx = await wallet.deployContract({
  solidityVersion: "0.8.28+commit.7893614a",
  solidityInputJson: contractInputJson,
  contractName: "WaveWarzBase",
  constructorArgs: {},
});
```

**Benefits of v2**:
- Official Coinbase SDK (`@coinbase/coinbase-sdk`)
- Stable managed wallets
- Full contract deployment support
- ERC-20, ERC-721, ERC-1155 deployment
- Automatic Etherscan verification
- Production-grade security

---

## Migration Checklist

### Step 1: Update Dependencies

```bash
# Remove old v1 SDK (if installed)
npm uninstall @coinbase/cdp-sdk

# Install new v2 SDK
npm install @coinbase/coinbase-sdk dotenv
```

### Step 2: Update .env Credentials

**Format stays the same** — no credential changes needed!

```bash
# .env (unchanged from v1)
CDP_API_KEY_ID=organizations/XXXX/apiKeys/XXXX
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
...
-----END EC PRIVATE KEY-----
CDP_WALLET_SECRET=0x7f14...
```

### Step 3: Update Code

#### Before (v1) ❌
```javascript
const { CdpClient } = require("@coinbase/cdp-sdk");
const cdp = new CdpClient();
const account = await cdp.evm.getOrCreateAccount("wavewarz-nova-001");
```

#### After (v2) ✅
```javascript
const { Wallet } = require("@coinbase/coinbase-sdk");
const wallet = await Wallet.create({ networkId: "base-sepolia" });
```

### Step 4: Use Official Deployment Patterns

#### Deploying a Contract

```javascript
const deployTx = await wallet.deployContract({
  solidityVersion: "0.8.28+commit.7893614a",
  solidityInputJson: contractInputJson, // from forge build --print-compiler-input
  contractName: "WaveWarzBase",
  constructorArgs: {}, // or { param: "value" }
});
await deployTx.wait();
```

#### Deploying an ERC-20

```javascript
const token = await wallet.deployToken({
  name: "ExampleCoin",
  symbol: "EXAM",
  totalSupply: 100000,
});
await token.wait();
```

#### Deploying an ERC-721 (NFT)

```javascript
const nft = await wallet.deployNFT({
  name: "My NFT",
  symbol: "MNFT",
  baseURI: "https://my-nft-base-uri.com/metadata/",
});
await nft.wait();
```

#### Invoking Contract Functions

```javascript
const tx = await wallet.invokeContract({
  contractAddress: "0x...",
  method: "buyShares",
  args: {
    battleId: "1002",
    artistA: true,
    amount: "100000000000000000", // 0.1 ETH in Wei
  },
});
await tx.wait();
```

---

## Key API Differences

### v1 vs v2 Method Mapping

| **v1 (Deprecated)** | **v2 (Current)** | **Notes** |
|---|---|---|
| `cdp.evm.getOrCreateAccount()` | `Wallet.create()` | Now returns full Wallet object |
| `account.address` | `wallet.getAddress()` | Get wallet address |
| `cdp.evm.requestFaucet()` | `wallet.faucet()` | Simplified faucet access |
| (not available) | `wallet.deployContract()` | NEW: Deploy arbitrary contracts |
| (not available) | `wallet.deployToken()` | NEW: Deploy ERC-20 |
| (not available) | `wallet.deployNFT()` | NEW: Deploy ERC-721 |
| (not available) | `wallet.deployMultiToken()` | NEW: Deploy ERC-1155 |
| (not available) | `wallet.invokeContract()` | NEW: Call any contract function |

---

## WaveWarz Base Migration

### Files Updated

| **File** | **Status** | **Notes** |
|---|---|---|
| `deploy-with-cdp.js` | ⚠️ Outdated | Uses v1 patterns, broken |
| `deploy-with-cdp-v2.js` | ✅ New | Uses official v2 patterns |
| `.env` | ✅ Unchanged | Same credentials work |
| `CREDENTIALS_GUIDE.md` | ✅ Updated | Documents both approaches |
| `README.md` | ✅ Updated | Recommends v2 for new deployments |

### Recommended Deployment Flow

**For Battle #1002**:

```bash
# Option 1: Web Dashboard (Easiest)
# Go to https://portal.cdp.coinbase.com/ → Send Transaction

# Option 2: Cast CLI (Simple)
# Use --rpc-url https://sepolia.base.org with private key

# Option 3: CDP v2 SDK (Most Powerful)
# node deploy-with-cdp-v2.js
# (Recommended for future deployments)
```

---

## Troubleshooting v2

### Error: "Missing scopes: [asset:write]"
**Cause**: API key needs additional permissions

**Fix**:
1. Go to https://portal.cdp.coinbase.com/projects/api-keys
2. Delete old API key
3. Create NEW API key (automatically includes all scopes)
4. Copy new credentials to .env

### Error: "Invalid network"
**Cause**: Wrong `networkId` in `Wallet.create()`

**Fix**: Use one of these:
- `"base-sepolia"` (testnet)
- `"base-mainnet"` (mainnet — use with caution)
- `"ethereum-sepolia"` (Ethereum testnet)

### Error: "Contract source not found"
**Cause**: Missing contract in `solidityInputJson`

**Fix**: Ensure all imported contracts are included:
```javascript
const wavewarzBaseInput = {
  sources: {
    "src/WaveWarzBase.sol": sources["src/WaveWarzBase.sol"],
    "src/IWaveWarzBase.sol": sources["src/IWaveWarzBase.sol"],
    "src/EphemeralBattleToken.sol": sources["src/EphemeralBattleToken.sol"],
    // ... all OpenZeppelin imports
  },
  language: compilerInputJson.language,
  settings: compilerInputJson.settings,
};
```

---

## Resources

- **Coinbase CDP Documentation**: https://docs.cdp.coinbase.com
- **Smart Contract Deployment Guide**: https://docs.cdp.coinbase.com/smart-contracts/docs/deployments
- **SDK Reference**: https://github.com/coinbase/coinbase-sdk-js
- **Base Sepolia Faucet**: https://www.alchemy.com/faucets/base-sepolia
- **Etherscan Verification**: https://sepolia.basescan.org

---

## Timeline

| **Date** | **Event** |
|---|---|
| **Feb 2, 2026** | ⚠️ Server Wallet v1 DEPRECATED |
| **Feb 21, 2026** | WaveWarz Base migrated to CDP v2 |
| **Future** | v1 support completely removed |

---

## Support

For migration issues:
1. Check [Troubleshooting v2](#troubleshooting-v2) section
2. Review official [Coinbase docs](https://docs.cdp.coinbase.com)
3. Verify credentials in .env are from NEW API key
4. Ensure Foundry compiler input JSON is complete
5. Test on Base Sepolia testnet first

---

**Status**: ✅ WaveWarz Base fully migrated to CDP v2
**Last Updated**: February 21, 2026
