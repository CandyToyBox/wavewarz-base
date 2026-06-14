#!/usr/bin/env node
/**
 * Entry-queue end-to-end dry run (Step 6).
 *
 * Drives one full cycle against a RUNNING backend on testnet:
 *   open -> human pick -> agent pick (x402) -> queue close -> live battle
 *   -> agent commitment deploys on-chain -> settle on dominance.
 *
 * This script does NOT hold secrets. It talks to the API only. The backend it
 * targets must already be configured with:
 *   - DATABASE_URL (migrations 001-008 applied)
 *   - BASE_RPC_URL = https://sepolia.base.org
 *   - WAVEWARZ_CONTRACT_ADDRESS, WAVEWARZ_WALLET_ADDRESS
 *   - ADMIN_PRIVATE_KEY (admin signer, funded) + ADMIN_API_KEY
 *   - a funded agent wallet for the agent pick (e.g. WAVEX_PRIVATE_KEY)
 *   - NODE_ENV=production so the REAL Audius source is used (dev uses the mock)
 *   - QUEUE_WINDOW_SECONDS small (e.g. 60) so the dry run finishes fast
 *
 * Usage:
 *   API_URL=http://localhost:3001 ADMIN_API_KEY=... \
 *   HUMAN_WALLET=0x... AGENT_ID=wavex-001 \
 *   node backend/scripts/entry-dry-run.mjs
 *
 * Notes:
 *   - The agent pick performs the x402 402-handshake. v1 records the payment
 *     proof but does not yet verify it on-chain, so AGENT_X402_TXHASH can be a
 *     real settled tx or, for a pure-plumbing test, any 0x… placeholder.
 *   - The agent's committed budget is deployed on-chain at live-open via the
 *     backend TradeExecutor, which needs the agent wallet funded with testnet ETH.
 */

const API_URL = process.env.API_URL || 'http://localhost:3001';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'dev-api-key';
const HUMAN_WALLET = process.env.HUMAN_WALLET || '0x000000000000000000000000000000000000dEaD';
const AGENT_ID = process.env.AGENT_ID || 'wavex-001';
const AGENT_X402_TXHASH = process.env.AGENT_X402_TXHASH || '0x' + 'ab'.repeat(32);
const HUMAN_BUDGET_WEI = process.env.HUMAN_BUDGET_WEI || '5000000000000000'; // 0.005 ETH
const AGENT_BUDGET_WEI = process.env.AGENT_BUDGET_WEI || '5000000000000000'; // 0.005 ETH

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { method = 'GET', body, admin = false, headers = {} } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(admin ? { 'x-api-key': ADMIN_API_KEY } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, res };
}

function log(step, msg) {
  console.log(`\n[${step}] ${msg}`);
}

async function main() {
  log('0', `target ${API_URL}`);

  // 1. Open a cycle (sources the Audius pair, starts the queue window)
  log('1', 'opening cycle…');
  const open = await api('/api/entry/open', { method: 'POST', admin: true, body: {} });
  if (!open.json.success) throw new Error(`open failed: ${JSON.stringify(open.json)}`);
  console.log(`    cycle ${open.json.data.id} | closes ${open.json.data.queueClosesAt}`);
  console.log(`    A: ${open.json.data.artistATrackUrl}`);
  console.log(`    B: ${open.json.data.artistBTrackUrl}`);

  // 2. Human pick (side A, trades live themselves)
  log('2', 'placing human pick on side A (self-trade)…');
  const human = await api('/api/entry/bet', {
    method: 'POST',
    body: {
      actorType: 'human',
      actorId: HUMAN_WALLET,
      sideIsArtistA: true,
      maxBudgetWei: HUMAN_BUDGET_WEI,
      autonomy: 'self',
    },
  });
  console.log(`    -> ${human.status} ${JSON.stringify(human.json.data ?? human.json.error)}`);

  // 3. Agent pick (side B) via x402 — expect 402, then retry with X-PAYMENT
  log('3', 'agent pick on side B via x402…');
  const noPay = await api('/api/entry/bet', {
    method: 'POST',
    body: { actorType: 'agent', actorId: AGENT_ID, sideIsArtistA: false, maxBudgetWei: AGENT_BUDGET_WEI },
  });
  if (noPay.status !== 402) {
    console.warn(`    expected 402, got ${noPay.status}: ${JSON.stringify(noPay.json)}`);
  } else {
    const req = noPay.res.headers.get('x-payment-required');
    console.log(`    402 received. payment-required: ${req}`);
  }
  const xPayment = Buffer.from(
    JSON.stringify({ txHash: AGENT_X402_TXHASH, reference: `entry-bet:${AGENT_ID}`, network: 'base-sepolia', timestamp: 0 })
  ).toString('base64');
  const agent = await api('/api/entry/bet', {
    method: 'POST',
    headers: { 'x-payment': xPayment },
    body: { actorType: 'agent', actorId: AGENT_ID, sideIsArtistA: false, maxBudgetWei: AGENT_BUDGET_WEI },
  });
  console.log(`    retry -> ${agent.status} ${JSON.stringify(agent.json.data ?? agent.json.error)}`);

  // 4. Tick until the cycle goes live (queue window must elapse)
  log('4', 'ticking until live (waiting for queue window to close)…');
  let live = false;
  for (let i = 0; i < 60 && !live; i++) {
    await sleep(5000);
    await api('/api/entry/tick', { method: 'POST', admin: true });
    const cur = await api('/api/entry');
    const status = cur.json.data?.cycle?.status;
    process.stdout.write(`    [${i}] status=${status} battleId=${cur.json.data?.cycle?.battleId ?? '-'}\r`);
    if (status === 'live') {
      live = true;
      console.log(`\n    LIVE — battle #${cur.json.data.cycle.battleId} started`);
    }
    if (status === 'settled') { live = true; }
  }

  // 5. Tick until settled (battle duration must elapse)
  log('5', 'ticking until settled (waiting for battle window to close)…');
  for (let i = 0; i < 200; i++) {
    await sleep(5000);
    await api('/api/entry/tick', { method: 'POST', admin: true });
    const cur = await api('/api/entry');
    const cycle = cur.json.data?.cycle;
    process.stdout.write(`    [${i}] status=${cycle?.status}\r`);
    if (!cycle || cycle.status === 'settled') {
      console.log(`\n    SETTLED — winner side ${cycle?.winnerIsArtistA ? 'A' : 'B'}`);
      break;
    }
  }

  log('done', 'dry run complete. Check the backend logs for on-chain tx hashes (initializeBattle / buyShares / endBattle).');
}

main().catch((err) => {
  console.error('\nDRY RUN FAILED:', err.message);
  process.exit(1);
});
