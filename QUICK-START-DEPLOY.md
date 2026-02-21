# 🚀 Quick Start - Deploy Battle #1002 Now

## ⏱️ 5-Minute Deployment Guide

### Option 1: Web Dashboard (No Code Required)
```
1. Go to https://portal.cdp.coinbase.com/
2. Click "Send Transaction"
3. Network: Base Sepolia
4. Paste deployment data from contract-compiler-input.json
5. Review and confirm in MetaMask
6. Done! ✅
```

### Option 2: One Command Deployment
```bash
# Install (first time only)
npm install

# Deploy Battle #1002
node deploy-with-cdp-v2.js
```

**What happens**:
- Creates managed server wallet (no private key needed)
- Deploys WaveWarzBase contract
- Initializes Battle #1002 with artists & configuration
- Shows contract address and Basescan link

### Option 3: With Private Key
```bash
export SIGNER_PRIVATE_KEY="0x..."
cast send 0xe28709DF5c77eD096f386510240A4118848c1098 \
  "initializeBattle((uint64,uint64,uint64,address,address,address,address))" \
  "1002,3600,..." \
  --rpc-url https://sepolia.base.org \
  --private-key $SIGNER_PRIVATE_KEY
```

---

## ✅ Pre-Deployment Checklist

Before deploying, verify:

```bash
# Check credentials
cat .env | grep "CDP_API_KEY_ID"
# Should show: CDP_API_KEY_ID=organizations/...

# Check compiler input
jq '.sources | keys | length' contract-compiler-input.json
# Should show: 11

# Check script syntax
node -c deploy-with-cdp-v2.js
# Should show: (no errors)

# Check dependencies
npm list @coinbase/coinbase-sdk
# Should show: @coinbase/coinbase-sdk@0.25.0
```

---

## 📍 Battle #1002 Configuration

```javascript
{
  battleId: 1002,
  duration: 3600,           // 1 hour
  startTime: <now + 2min>,

  // Artists
  artistA: 0xCB22D1D13665B99F8f140f4047BCB73872982E77,
  artistB: 0x1C077ca097B99FE953Bdf8Dcc871C276dD7aDb11,
  platform: 0x2EAF14adAA4d32A0cd807bC15A40c3A93FA68c30,

  // Payment Token
  paymentToken: 0x4200000000000000000000000000000000000006 (WETH)
}
```

---

## 🎯 After Deployment

1. **Wait for confirmation** (2-5 minutes)
2. **View on Basescan** (link in deploy output)
3. **Run test trades**:
   ```bash
   node execute-trades-1002.js
   ```
4. **Monitor fee distribution** (see DEPLOYMENT-CHECKLIST.md)

---

## 🆘 If Something Goes Wrong

### Error: "Missing scopes: [asset:write]"
→ Recreate API key at https://portal.cdp.coinbase.com/projects/api-keys

### Error: "Invalid network"
→ Update .env CDP_WALLET_SECRET to match selected network

### Error: "Contract source not found"
→ Regenerate compiler input:
```bash
forge build
forge inspect WaveWarzBase standardJson > contract-compiler-input.json
```

### Error: Timeout or Network Issues
→ Wait 1-2 minutes and retry (network congestion is temporary)

---

## 📚 Full Documentation

- **DEPLOYMENT-CHECKLIST.md** - Detailed verification steps
- **COINBASE-CDP-V2-MIGRATION.md** - SDK migration details
- **README.md** - Complete platform overview
- **CREDENTIALS_GUIDE.md** - Credential format reference

---

## 🎉 You're Ready!

Everything is set up for immediate deployment. Choose your method above and deploy Battle #1002!

**Need help?** See the full checklists and guides in the repository.
