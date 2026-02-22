#!/usr/bin/env node
/**
 * CDP Faucet Script
 * Requests test tokens from Coinbase Developer Platform faucet
 *
 * Supported networks: base-sepolia, ethereum-sepolia, ethereum-hoodi
 * Supported tokens:   eth, usdc, eurc, cbbtc
 *
 * Rate limits (per address per 24h):
 *   ETH:   0.0001 ETH/request, max 0.1 ETH  (1000 requests max)
 *   USDC:  1 USDC/request,     max 10 USDC
 *   EURC:  1 EURC/request,     max 10 EURC
 *   cbBTC: 0.0001/request,     max 0.001
 *
 * NOTE: Address-level limit is 10 requests/24h in practice.
 * For larger amounts use multiple addresses or external faucets:
 *   - https://www.alchemy.com/faucets/base-sepolia
 *   - https://faucet.quicknode.com/base/sepolia
 *   - https://faucets.chain.link/base-sepolia
 *
 * Usage:
 *   node scripts/cdp-faucet.js <address> [network] [token] [count]
 *
 * Examples:
 *   node scripts/cdp-faucet.js 0xABC...123
 *   node scripts/cdp-faucet.js 0xABC...123 base-sepolia eth 5
 *   node scripts/cdp-faucet.js 0xABC...123 ethereum-sepolia usdc 3
 *
 * Requires env vars: CDP_API_KEY_ID, CDP_API_KEY_SECRET
 */

const crypto = require('crypto');
const fs = require('fs');

// ── .env parser (handles multiline quoted values) ────────────────────────────

function parseEnv(filePath = '.env') {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return {};
  }
  const env = {};
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (ch === '\n' || ch === '\r' || ch === '#') {
      i = (content.indexOf('\n', i) + 1) || content.length;
      continue;
    }
    const eqIdx = content.indexOf('=', i);
    if (eqIdx < 0) break;
    const key = content.slice(i, eqIdx).trim();
    i = eqIdx + 1;
    let value;
    if (content[i] === '"') {
      const end = content.indexOf('"', i + 1);
      value = content.slice(i + 1, end);
      i = end + 1;
    } else {
      const end = content.indexOf('\n', i);
      value = (end < 0 ? content.slice(i) : content.slice(i, end)).trim();
      i = end < 0 ? content.length : end + 1;
    }
    env[key] = value;
  }
  return env;
}

// ── Load env ─────────────────────────────────────────────────────────────────

const fileEnv = parseEnv();
const env = { ...fileEnv, ...process.env };

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [,, address, network = 'base-sepolia', token = 'eth', countArg = '1'] = process.argv;
  const count = parseInt(countArg, 10);

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    console.error('Usage: node scripts/cdp-faucet.js <address> [network] [token] [count]');
    console.error('Example: node scripts/cdp-faucet.js 0xABC...123 base-sepolia eth 10');
    process.exit(1);
  }

  const apiKeyId = env.CDP_API_KEY_ID;
  const apiKeySecret = env.CDP_API_KEY_SECRET;

  if (!apiKeyId || !apiKeySecret) {
    console.error('CDP_API_KEY_ID and CDP_API_KEY_SECRET must be set');
    process.exit(1);
  }

  // Convert SEC1 EC key to PKCS8 (required by CDP SDK)
  let pkcs8Secret;
  try {
    const keyObj = crypto.createPrivateKey(apiKeySecret);
    pkcs8Secret = keyObj.export({ type: 'pkcs8', format: 'pem' });
  } catch (e) {
    console.error('Failed to parse CDP_API_KEY_SECRET:', e.message);
    process.exit(1);
  }

  const { CdpClient } = require('@coinbase/cdp-sdk');
  const client = new CdpClient({
    apiKeyId,
    apiKeySecret: pkcs8Secret,
    walletSecret: env.CDP_WALLET_SECRET,
  });

  console.log(`\n🚰 CDP Faucet — ${network} | ${token.toUpperCase()} | ${count} request(s)`);
  console.log(`   Address: ${address}\n`);

  let success = 0;
  for (let i = 0; i < count; i++) {
    try {
      const result = await client.evm.requestFaucet({ network, address, token });
      success++;
      const explorer = network === 'base-sepolia'
        ? `https://sepolia.basescan.org/tx/${result.transactionHash}`
        : `https://sepolia.etherscan.io/tx/${result.transactionHash}`;
      console.log(`✅ [${success}/${count}] ${result.transactionHash}`);
      console.log(`   ${explorer}`);
      if (i < count - 1) await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      const msg = e.message || String(e);
      if (msg.includes('rate limit') || msg.includes('faucet_limit')) {
        console.log(`\n⚠️  Rate limited after ${success} request(s).`);
        console.log(`   Address limit: ~10 requests/24h`);
        console.log(`\n   Alternative faucets:`);
        console.log(`   • https://www.alchemy.com/faucets/base-sepolia`);
        console.log(`   • https://faucet.quicknode.com/base/sepolia`);
        console.log(`   • https://faucets.chain.link/base-sepolia`);
        break;
      }
      console.log(`❌ [${i + 1}/${count}] ${msg}`);
    }
  }

  const amountMap = { eth: 0.0001, usdc: 1, eurc: 1, cbbtc: 0.0001 };
  const total = (success * (amountMap[token] || 0)).toFixed(4);
  console.log(`\nDone: ${success}/${count} succeeded (~${total} ${token.toUpperCase()} sent)`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
