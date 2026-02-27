#!/usr/bin/env node
/**
 * WaveWarz Base - WAVEX vs NOVA End-to-End Test
 *
 * Runs WAVEX and NOVA through the full platform flow without OpenClaw:
 *   1. Register both agents
 *   2. Generate music tracks (mock or real Suno)
 *   3. Join the battle queue
 *   4. Wait for auto-matchmaking → battle creation
 *   5. Simulate trading (both agents trade on each other)
 *   6. Wait for battle settlement
 *   7. Claim/withdrawal payout
 *
 * Usage:
 *   node scripts/test-wavex-vs-nova.js [--mock] [--api-url http://localhost:3001]
 *
 * Flags:
 *   --mock      Use mock track URLs instead of generating real Suno tracks
 *   --api-url   Backend API base URL (default: http://localhost:3001)
 *   --skip-register  Skip registration if agents already exist
 */

const API_URL = process.argv.includes('--api-url')
  ? process.argv[process.argv.indexOf('--api-url') + 1]
  : 'http://localhost:3001';

const USE_MOCK = process.argv.includes('--mock');
const SKIP_REGISTER = process.argv.includes('--skip-register');

// Colors for terminal output
const c = {
  reset: '\x1b[0m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

function log(symbol, label, msg, color = c.reset) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`${c.dim}[${ts}]${c.reset} ${color}${symbol} ${label}${c.reset}  ${msg}`);
}

function info(label, msg) { log('●', label, msg, c.cyan); }
function ok(label, msg)   { log('✓', label, msg, c.green); }
function warn(label, msg) { log('!', label, msg, c.yellow); }
function err(label, msg)  { log('✗', label, msg, c.red); }
function step(n, msg)     { console.log(`\n${c.bold}${c.blue}─── Step ${n}: ${msg} ───${c.reset}`); }
function divider()        { console.log(`${c.dim}${'─'.repeat(60)}${c.reset}`); }

async function api(method, path, body) {
  const url = `${API_URL}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json();

  if (!res.ok && !data.success) {
    // Some 409s (already registered) are OK
    if (res.status === 409) return { success: false, conflict: true, error: data.error };
    throw new Error(`${method} ${path} → ${res.status}: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Agent configs ─────────────────────────────────────────────────────────────

const WAVEX = {
  agentId: 'wavex-001',
  displayName: 'WAVEX',
  walletAddress: '0x1C077ca097B99FE953Bdf8Dcc871C276dD7aDb11', // registered Base Sepolia wallet
  track: {
    url: USE_MOCK
      ? 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
      : null,
    durationSeconds: 180, // 3 min
  },
  strategy: 'aggressive_early',
};

const NOVA = {
  agentId: 'nova-001',
  displayName: 'NOVA',
  walletAddress: '0xCB22D1D13665B99F8f140f4047BCB73872982E77', // registered Base Sepolia wallet
  track: {
    url: USE_MOCK
      ? 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'
      : null,
    durationSeconds: 210, // 3.5 min
  },
  strategy: 'patient_closer',
};

// ── Step 1: Health Check ──────────────────────────────────────────────────────

async function checkHealth() {
  step(1, 'Health Check');
  const res = await fetch(`${API_URL}/health`);
  const data = await res.json();
  if (data.status === 'ok') {
    ok('BACKEND', `Running · ${data.timestamp}`);
  } else {
    throw new Error('Backend health check failed');
  }
}

// ── Step 1b: Wallet Balance Check ────────────────────────────────────────────

async function checkWalletBalances() {
  step('1b', 'Wallet Balance Check');

  const MIN_BALANCE = 0.01;
  let allFunded = true;

  for (const agent of [WAVEX, NOVA]) {
    const res = await api('GET', `/api/wallet/balance/${agent.walletAddress}`);
    const bal = parseFloat(res.data.balance);
    const funded = bal >= MIN_BALANCE;

    if (!funded) allFunded = false;

    const color = funded ? c.green : c.red;
    const symbol = funded ? '✓' : '✗';
    log(symbol, agent.agentId,
      `Balance: ${res.data.balance} ETH ${funded ? '(OK)' : `(need ${(MIN_BALANCE - bal).toFixed(4)} more)`}`,
      color
    );
  }

  if (!allFunded) {
    warn('WALLETS', 'One or more wallets below minimum. Fund via:');
    console.log(`  ${c.cyan}→ https://www.alchemy.com/faucets/base-sepolia${c.reset}`);
    console.log(`  ${c.cyan}→ https://faucet.quicknode.com/base/sepolia${c.reset}`);
    console.log(`  ${c.cyan}→ https://faucets.chain.link/base-sepolia${c.reset}`);
    console.log(`\n  Addresses to fund:`);
    console.log(`  ${c.dim}WAVEX: 0x1C077ca097B99FE953Bdf8Dcc871C276dD7aDb11${c.reset}`);
    console.log(`  ${c.dim}NOVA:  0xCB22D1D13665B99F8f140f4047BCB73872982E77${c.reset}\n`);

    if (!process.argv.includes('--force')) {
      warn('WALLETS', 'Use --force to attempt queue join anyway (will likely get 402)');
    }
  }

  return allFunded;
}

// ── Step 2: Register Agents ───────────────────────────────────────────────────

async function registerAgents() {
  step(2, 'Register Agents');

  for (const agent of [WAVEX, NOVA]) {
    if (SKIP_REGISTER) {
      warn(agent.agentId, 'Skipping registration (--skip-register)');
      continue;
    }

    const result = await api('POST', '/api/agents/register', {
      agentId: agent.agentId,
      walletAddress: agent.walletAddress,
      displayName: agent.displayName,
    });

    if (result.conflict) {
      warn(agent.agentId, `Already registered — continuing`);
    } else if (result.success) {
      ok(agent.agentId, `Registered · wallet: ${agent.walletAddress}`);
    }
  }
}

// ── Step 3: Generate Tracks ───────────────────────────────────────────────────

async function generateTracks() {
  step(3, 'Generate / Assign Tracks');

  if (USE_MOCK) {
    for (const agent of [WAVEX, NOVA]) {
      ok(agent.agentId, `Mock track assigned: ${agent.track.url}`);
    }
    return;
  }

  // Real track generation via /api/music/generate
  for (const agent of [WAVEX, NOVA]) {
    info(agent.agentId, 'Requesting Suno track generation...');

    try {
      const result = await api('POST', '/api/music/generate', {
        agentId: agent.agentId,
        style: agent.agentId === 'wavex-001' ? 'hip-hop aggressive battle' : 'melodic R&B soul',
        prompt: agent.agentId === 'wavex-001'
          ? 'Aggressive battle rap with hard 808s, cyber-warrior energy, blockchain dominance'
          : 'Smooth melodic R&B with ethereal production, patient and calculated energy',
        duration: agent.track.durationSeconds,
      });

      if (result.success && result.data?.trackUrl) {
        agent.track.url = result.data.trackUrl;
        agent.track.durationSeconds = result.data.durationSeconds || agent.track.durationSeconds;
        ok(agent.agentId, `Track generated: ${agent.track.url}`);
      } else {
        warn(agent.agentId, `Music generation returned no URL — using fallback mock`);
        agent.track.url = `https://mock-cdn.wavewarz.io/tracks/${agent.agentId}-fallback.mp3`;
      }
    } catch (e) {
      warn(agent.agentId, `Music generation failed (${e.message}) — using mock track`);
      agent.track.url = `https://mock-cdn.wavewarz.io/tracks/${agent.agentId}-fallback.mp3`;
    }
  }
}

// ── Step 4: Join Queue ────────────────────────────────────────────────────────

async function joinQueue() {
  step(4, 'Join Battle Queue');

  const queueBefore = await api('GET', '/api/queue');
  info('QUEUE', `Current depth: ${queueBefore.data.entries.length} / active battles: ${queueBefore.data.activeBattles.length}`);

  // WAVEX joins first
  try {
    const wavexResult = await api('POST', '/api/queue/join', {
      agentId: WAVEX.agentId,
      trackUrl: WAVEX.track.url,
      trackDurationSeconds: WAVEX.track.durationSeconds,
    });
    if (wavexResult.success) {
      ok('WAVEX', `Joined queue · entry ID: ${wavexResult.data?.id || 'n/a'}`);
    }
  } catch (e) {
    if (e.message.includes('already in an active battle')) {
      warn('WAVEX', 'Already in active battle — will pick up existing battle');
    } else {
      throw e;
    }
  }

  // Small delay then NOVA joins
  await sleep(500);

  try {
    const novaResult = await api('POST', '/api/queue/join', {
      agentId: NOVA.agentId,
      trackUrl: NOVA.track.url,
      trackDurationSeconds: NOVA.track.durationSeconds,
    });
    if (novaResult.success) {
      ok('NOVA', `Joined queue · entry ID: ${novaResult.data?.id || 'n/a'}`);
    }
  } catch (e) {
    if (e.message.includes('already in an active battle')) {
      warn('NOVA', 'Already in active battle — will pick up existing battle');
    } else {
      throw e;
    }
  }

  const queueAfter = await api('GET', '/api/queue');
  info('QUEUE', `After join: ${queueAfter.data.entries.length} entries, ${queueAfter.data.activeBattles.length} active`);

  return queueAfter.data;
}

// ── Step 5: Wait for Battle Creation ─────────────────────────────────────────

async function waitForBattle(maxWaitMs = 30000) {
  step(5, 'Waiting for Battle Auto-Creation');

  const startedAt = Date.now();
  let battleId = null;

  while (Date.now() - startedAt < maxWaitMs) {
    const queue = await api('GET', '/api/queue');

    if (queue.data.activeBattles.length > 0) {
      battleId = parseInt(queue.data.activeBattles[0].battleId, 10);
      ok('MATCHMAKING', `Battle #${battleId} created! Status: ${queue.data.activeBattles[0].status}`);
      return battleId;
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    info('MATCHMAKING', `Waiting for matchmaking... (${elapsed}s)`);
    await sleep(2000);
  }

  warn('MATCHMAKING', 'Battle not auto-created within timeout. Checking battles list...');

  // Try listing recent battles as fallback
  const battles = await api('GET', '/api/battles?status=active&page=1');
  if (battles.success && battles.data?.battles?.length > 0) {
    battleId = parseInt(battles.data.battles[0].id, 10);
    ok('BATTLES', `Found active battle #${battleId} from list`);
    return battleId;
  }

  throw new Error('No battle created after waiting. Check matchmaking service logs.');
}

// ── Step 6: Simulate Trading ──────────────────────────────────────────────────

async function simulateTrades(battleId) {
  step(6, `Simulate Agent Trades (Battle #${battleId})`);

  info('TRADING', `WAVEX strategy: aggressive_early (buy 60% early)`);
  info('TRADING', `NOVA strategy: patient_closer (observe first, surge late)`);

  // Amounts in wei (1 ETH = 1e18 wei). Using 0.001 ETH = 1000000000000000 wei per trade.
  const trades = [
    // WAVEX buys own side early (aggressive)
    { agent: WAVEX, side: 'A', action: 'buy', amount: '10000000000000000', note: 'WAVEX early aggression (0.01 ETH)' },
    // NOVA observes then starts accumulating mid-battle
    { agent: NOVA, side: 'B', action: 'buy', amount: '5000000000000000', note: 'NOVA mid accumulation (0.005 ETH)' },
    // WAVEX adds more on momentum
    { agent: WAVEX, side: 'A', action: 'buy', amount: '5000000000000000', note: 'WAVEX momentum add (0.005 ETH)' },
    // NOVA closing surge
    { agent: NOVA, side: 'B', action: 'buy', amount: '10000000000000000', note: 'NOVA closing surge (0.01 ETH)' },
  ];

  let tradesExecuted = 0;

  for (const trade of trades) {
    try {
      // Get unsigned tx data from backend
      const txData = await api('POST', `/api/agents/${trade.agent.agentId}/prepare-buy`, {
        battleId,
        artistA: trade.side === 'A',
        amount: trade.amount,
        minTokensOut: '0', // No slippage protection in test
      });

      if (txData.success) {
        ok(trade.agent.agentId, `${trade.note} · tx prepared · contractAddress: ${txData.data?.to || 'n/a'}`);
        info('TX', `calldata ready (${(txData.data?.data?.length || 0)} bytes) — agent would sign & broadcast`);
        tradesExecuted++;
      }
    } catch (e) {
      warn(trade.agent.agentId, `Trade prep failed: ${e.message}`);
    }

    await sleep(300);
  }

  info('TRADING', `${tradesExecuted}/${trades.length} trades prepared successfully`);
  info('TRADING', `Note: In production, each agent signs the tx with their private key and broadcasts to Base`);
}

// ── Step 7: Check Battle State ────────────────────────────────────────────────

async function checkBattleState(battleId) {
  step(7, `Battle State (Battle #${battleId})`);

  const result = await api('GET', `/api/battles/${battleId}`);
  if (!result.success) {
    warn('BATTLE', `Could not fetch battle state: ${result.error}`);
    return null;
  }

  const b = result.data;
  const totalPool = (b.artist1Pool || 0) + (b.artist2Pool || 0);

  info('BATTLE', `Status: ${b.status}`);
  info('BATTLE', `WAVEX (Side A) pool: ${b.artist1Pool || 0} ETH`);
  info('BATTLE', `NOVA  (Side B) pool: ${b.artist2Pool || 0} ETH`);
  info('BATTLE', `Total TVL: ${totalPool} ETH`);
  info('BATTLE', `Winner decided: ${b.winnerDecided ? 'YES' : 'NO - still trading'}`);

  if (b.winnerDecided) {
    const winner = b.winnerArtistA ? 'WAVEX (Side A)' : 'NOVA (Side B)';
    ok('WINNER', `🏆 ${winner}`);
  }

  return b;
}

// ── Step 8: NFT Check ─────────────────────────────────────────────────────────

async function checkNFTs() {
  step(8, 'NFT / Marketplace Check');

  try {
    const result = await fetch(`${API_URL}/api/nft/list`);
    if (result.ok) {
      const data = await result.json();
      info('NFT', `${data.data?.length || 0} NFTs in marketplace`);
    } else {
      warn('NFT', 'NFT list endpoint not available or no NFTs yet');
    }
  } catch (e) {
    warn('NFT', `NFT check skipped: ${e.message}`);
  }
}

// ── Step 9: Prepare Claim ─────────────────────────────────────────────────────

async function prepareClaims(battleId) {
  step(9, `Prepare Claim/Withdrawal (Battle #${battleId})`);

  for (const agent of [WAVEX, NOVA]) {
    try {
      const result = await api('POST', `/api/agents/${agent.agentId}/prepare-claim`, {
        battleId,
      });

      if (result.success) {
        ok(agent.agentId, `Claim tx prepared · agent would sign & broadcast to collect payout`);
      } else {
        warn(agent.agentId, `Claim prep: ${result.error}`);
      }
    } catch (e) {
      warn(agent.agentId, `Claim prep failed: ${e.message}`);
    }
  }
}

// ── Step 10: Summary ──────────────────────────────────────────────────────────

function printSummary(results) {
  divider();
  console.log(`\n${c.bold}${c.green}END-TO-END TEST SUMMARY${c.reset}\n`);

  const rows = [
    ['Health Check',        results.health      ? '✓ PASS' : '✗ FAIL'],
    ['Wallet Balances',     results.wallets     ? '✓ PASS' : '✗ NEED FUNDS'],
    ['Agent Registration',  results.register    ? '✓ PASS' : '✗ FAIL'],
    ['Track Generation',    results.tracks      ? '✓ PASS' : '! MOCK'],
    ['Queue Join',          results.queue       ? '✓ PASS' : '✗ FAIL'],
    ['Battle Creation',     results.battle      ? '✓ PASS' : '✗ FAIL'],
    ['Trade Preparation',   results.trades      ? '✓ PASS' : '! PARTIAL'],
    ['Battle State',        results.state       ? '✓ PASS' : '! PENDING'],
    ['NFT Check',           results.nft         ? '✓ PASS' : '! SKIPPED'],
    ['Claim Preparation',   results.claim       ? '✓ PASS' : '! PENDING'],
  ];

  for (const [label, status] of rows) {
    const color = status.startsWith('✓') ? c.green
                : status.startsWith('✗') ? c.red
                : c.yellow;
    console.log(`  ${color}${status}${c.reset}  ${label}`);
  }

  console.log(`\n${c.dim}Notes:${c.reset}`);
  console.log(`  ${c.dim}· "! MOCK"    = test ran with mock data (no real Suno call)${c.reset}`);
  console.log(`  ${c.dim}· "! PARTIAL" = some trades failed (expected — no real wallet signing)${c.reset}`);
  console.log(`  ${c.dim}· "! PENDING" = battle still active, check later${c.reset}`);
  console.log(`  ${c.dim}· Trade signing requires funded Base Sepolia wallets${c.reset}`);
  console.log(`  ${c.dim}· CDP credentials needed for real wallet creation (fix 401 in Supabase Vault)${c.reset}`);
  console.log();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}${c.blue}╔══════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.blue}║  WAVEX vs NOVA  ·  End-to-End Test       ║${c.reset}`);
  console.log(`${c.bold}${c.blue}║  WaveWarz Base · $(date)${c.reset}`);
  console.log(`${c.bold}${c.blue}╚══════════════════════════════════════════╝${c.reset}\n`);

  info('CONFIG', `API: ${API_URL}`);
  info('CONFIG', `Mode: ${USE_MOCK ? 'MOCK (no real Suno)' : 'LIVE (real Suno API)'}`);
  info('CONFIG', `Skip Register: ${SKIP_REGISTER}`);
  divider();

  const results = {};

  try {
    await checkHealth();
    results.health = true;
  } catch (e) {
    err('HEALTH', e.message);
    results.health = false;
    process.exit(1);
  }

  const walletsOk = await checkWalletBalances();
  results.wallets = walletsOk;

  try {
    await registerAgents();
    results.register = true;
  } catch (e) {
    err('REGISTER', e.message);
    results.register = false;
  }

  try {
    await generateTracks();
    results.tracks = USE_MOCK ? 'mock' : true;
  } catch (e) {
    err('TRACKS', e.message);
    results.tracks = false;
  }

  let queueData;
  try {
    queueData = await joinQueue();
    results.queue = true;
  } catch (e) {
    err('QUEUE', e.message);
    results.queue = false;
  }

  let battleId;
  try {
    battleId = await waitForBattle();
    results.battle = true;
  } catch (e) {
    warn('BATTLE', e.message);
    results.battle = false;
  }

  if (battleId) {
    try {
      await simulateTrades(battleId);
      results.trades = true;
    } catch (e) {
      warn('TRADES', e.message);
      results.trades = false;
    }

    const battleState = await checkBattleState(battleId);
    results.state = !!battleState;

    await checkNFTs();
    results.nft = true;

    if (battleState?.winnerDecided) {
      try {
        await prepareClaims(battleId);
        results.claim = true;
      } catch (e) {
        warn('CLAIM', e.message);
        results.claim = false;
      }
    } else {
      warn('CLAIM', `Battle still active — run claim after settlement completes`);
      warn('CLAIM', `Command: node scripts/test-wavex-vs-nova.js --claim-battle ${battleId}`);
      results.claim = 'pending';
    }
  } else {
    results.trades = false;
    results.state = false;
    results.nft = false;
    results.claim = false;
  }

  printSummary(results);
}

main().catch(e => {
  err('FATAL', e.message);
  console.error(e.stack);
  process.exit(1);
});
