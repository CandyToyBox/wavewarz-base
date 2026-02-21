# 🔐 WaveWarz Base - Credentials Reference Guide

## Credentials You Might Need

There are **TWO different approaches**, each with different credentials:

---

## APPROACH 1: Cast (Simple - If You Have a Private Key)

### What You Need
**ONE** private key from any funded wallet on Base Sepolia

### Variable Names
```bash
SIGNER_PRIVATE_KEY          # The key that will sign the deployment
```

### What It Looks Like
```
Format:  0x + 64 hexadecimal characters
Example: 0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a
```

### Where to Get It
- MetaMask: Account Details → Export Private Key
- Coinbase Wallet: Settings → Reveal Private Key
- Hardware wallet: Use your device's export function
- Any EVM wallet

### How to Use
```bash
export SIGNER_PRIVATE_KEY="0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a"

# Then run Cast command (you have this installed!)
cast send 0xe28709DF5c77eD096f386510240A4118848c1098 \
  "initializeBattle((uint64,uint64,uint64,address,address,address,address))" \
  "1002,3600,..." \
  --rpc-url https://sepolia.base.org \
  --private-key $SIGNER_PRIVATE_KEY
```

---

## APPROACH 2: Coinbase CDP (Recommended - Uses Your Existing Accounts)

### What You Need
**THREE** credentials from Coinbase Developer Portal

### Variable Names & What They Are

#### 1️⃣ CDP_API_KEY_ID
**What it is:** Your API key identifier
```
Format:  Long UUID-like string
Example: organizations/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/apiKeys/ffffffff-0000-1111-2222-333333333333

Where to get: https://portal.cdp.coinbase.com/projects/api-keys
               → Click "Create API Key"
               → Copy the "Key ID" field
```

#### 2️⃣ CDP_API_KEY_SECRET
**What it is:** The secret for your API key (like a password)
```
Format:  Very long encoded string (starts with -----BEGIN EC PRIVATE KEY-----)
Example: -----BEGIN EC PRIVATE KEY-----
         MHcCAQEEIIGlVmysT0v+...
         ...many lines of text...
         -----END EC PRIVATE KEY-----

Where to get: https://portal.cdp.coinbase.com/projects/api-keys
               → Click "Create API Key"
               → IMMEDIATELY save the secret shown (can't see it again!)
               → Or download as file
⚠️  CRITICAL: Save this immediately when creating the key - you can only see it once!
```

#### 3️⃣ CDP_WALLET_SECRET
**What it is:** Encrypts your server wallets (like a vault password)
```
Format:  Long hex string or encoded format
Example: 0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f

Where to get: https://portal.cdp.coinbase.com/products/server-wallet/accounts
               → Scroll down to "Wallet Secret" section
               → Click "Generate new secret"
               → Save it immediately
⚠️  CRITICAL: Save this immediately - you can only see it once!
```

### How to Use

Create a `.env` file:
```bash
cat > .env << 'EOF'
# Coinbase CDP Credentials
CDP_API_KEY_ID=organizations/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/apiKeys/ffffffff-0000-1111-2222-333333333333
CDP_API_KEY_SECRET=-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIIGlVmysT0v+...
...
-----END EC PRIVATE KEY-----
CDP_WALLET_SECRET=0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f
EOF
```

Then run:
```bash
npm install @coinbase/cdp-sdk viem dotenv
node deploy-with-cdp.js
```

---

## Quick Decision Tree

```
Do you have a private key from a funded Base Sepolia wallet?
│
├─ YES → Use APPROACH 1 (Cast)
│        Variable: SIGNER_PRIVATE_KEY
│        Format: 0x + 64 hex chars
│
└─ NO → Use APPROACH 2 (Coinbase CDP)
         Variables: CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
         Get from: https://portal.cdp.coinbase.com
```

---

## Your CDP Accounts (Already Exist!)

Once authenticated with CDP, you can use these accounts:

```
Account Name              Address                              Role
─────────────────────────────────────────────────────────────────────
wavewarz-nova-001        0xCB22D1D13665B99F8f140f4047BCB73872982E77  Artist A (Deployer)
wavewarz-wavex-001       0x1C077ca097B99FE953Bdf8Dcc871C276dD7aDb11  Artist B (Trader 1)
wavewarz-lil-lob-001     0x2EAF14adAA4d32A0cd807bC15A40c3A93FA68c30  Platform (Trader 2)
```

These are **managed server wallets** - you use them through the CDP API, not with private keys!

---

## Example Scenarios

### Scenario 1: You Have MetaMask Wallet with Base Sepolia ETH
```bash
# Get private key from MetaMask → Account Details → Export Private Key
export SIGNER_PRIVATE_KEY="0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a"

# Deploy using Cast
cast send 0xe28709DF5c77eD096f386510240A4118848c1098 \
  "initializeBattle((uint64,uint64,uint64,address,address,address,address))" \
  "1002,3600,..." \
  --rpc-url https://sepolia.base.org \
  --private-key $SIGNER_PRIVATE_KEY
```

### Scenario 2: You Only Have Coinbase CDP Accounts
```bash
# Get credentials from https://portal.cdp.coinbase.com
export CDP_API_KEY_ID="organizations/..."
export CDP_API_KEY_SECRET="-----BEGIN EC PRIVATE KEY-----..."
export CDP_WALLET_SECRET="0a1b2c3d..."

# Deploy using CDP SDK
node deploy-with-cdp.js
```

---

## Summary

| Variable | What Is It | Format | Where to Get |
|----------|-----------|--------|-------------|
| **SIGNER_PRIVATE_KEY** | Private key to sign txs | 0x + 64 hex | Any EVM wallet (MetaMask, Coinbase, etc) |
| **CDP_API_KEY_ID** | CDP API identifier | UUID string | https://portal.cdp.coinbase.com/projects/api-keys |
| **CDP_API_KEY_SECRET** | CDP API secret | EC PRIVATE KEY block | https://portal.cdp.coinbase.com/projects/api-keys (save immediately!) |
| **CDP_WALLET_SECRET** | Wallet encryption key | Hex string | https://portal.cdp.coinbase.com/products/server-wallet/accounts |

---

## ❓ Which Should You Use?

**Use APPROACH 1 (Cast)** if:
- You have a MetaMask or other wallet with Base Sepolia ETH
- You already know your private key
- You want the simplest method

**Use APPROACH 2 (Coinbase CDP)** if:
- You prefer using the Coinbase platform
- You want managed server wallets (no private key handling)
- You've already set up the CDP dashboard
