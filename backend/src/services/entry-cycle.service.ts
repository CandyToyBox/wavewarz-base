/**
 * Entry-Cycle Service (always-on protocol model)
 *
 * Drives one cycle of the locked v1 model:
 *   open (~23h queue, picks are COMMITMENTS only, nothing on-chain)
 *     -> locked/live (~10-min Quick Battle on the existing WaveWarzBase contract)
 *     -> settled (winner = trading dominance, payout + loser-pool refund on-chain).
 *
 * No contract changes: the contract's [startTime, endTime] window already
 * enforces "nothing moves during the queue", buyShares is open-access (any
 * agent/human), and endBattle settles on pool dominance. This service is the
 * off-chain glue + pick store. Distinct from QueueService (agent matchmaking).
 *
 * Execution during the live window is free-form per actor (auto at open, trade
 * during, snipe at end). For agents with autonomy='agent' this service deploys
 * their committed budget at live-open via TradeExecutor (the simple default
 * path); the agent-trading-engine and present humans may trade further within
 * the committed budget.
 */

import { Pool } from 'pg';
import { AudiusService } from './audius.service.js';
import { BlockchainService } from './blockchain.service.js';
import { TradeExecutor } from './trade-executor.js';
import type {
  EntryCycle,
  EntryPick,
  EntryActorType,
  EntryAutonomy,
} from '../types/index.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
// Distinct battleId namespace so entry-cycle battles never collide with
// battles created by other flows (matchmaking, manual scripts).
const ENTRY_BATTLE_ID_BASE = 9_000_000;
// Buffer between initializeBattle tx and the live window opening, so the
// contract's `startTime >= block.timestamp` check passes and the tx mines.
const START_BUFFER_SECONDS = 30;

export interface EntryCycleConfig {
  battlesPerCycle: number;        // v1 = 1
  queueWindowSeconds: number;     // ~23h in prod, short for testnet dry runs
  battleDurationSeconds: number;  // ~600 (10 min)
  agentMaxBudgetWei: bigint;      // per-actor per-battle cap (testnet safety)
  artistAWallet: string;          // fee sink for side A (v1 placeholder)
  artistBWallet: string;          // fee sink for side B (v1 placeholder)
  wavewarzWallet: string;
  paymentToken: string;           // ZERO_ADDRESS = ETH (testnet default)
}

interface PlacePickInput {
  actorType: EntryActorType;
  actorId: string;                // agentId or wallet address
  sideIsArtistA: boolean;
  maxBudgetWei: bigint;
  autonomy?: EntryAutonomy;       // default 'agent'
  controlsAgentId?: string | null; // human override target
  x402TxHash?: string | null;     // x402 settlement proof for agent picks
}

export class EntryCycleService {
  private pool: Pool;
  private audius: AudiusService;
  private blockchain: BlockchainService;
  private tradeExecutor: TradeExecutor;
  private cfg: EntryCycleConfig;
  private ticking = false;

  constructor(
    databaseUrl: string,
    audius: AudiusService,
    blockchain: BlockchainService,
    tradeExecutor: TradeExecutor,
    cfg: EntryCycleConfig
  ) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
    this.audius = audius;
    this.blockchain = blockchain;
    this.tradeExecutor = tradeExecutor;
    this.cfg = cfg;
  }

  // ---------------------------------------------------------------- queries

  /** The single active cycle (open or live), with its picks. Null if none. */
  async getCurrentCycle(): Promise<{ cycle: EntryCycle; picks: EntryPick[] } | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM entry_cycles
        WHERE status IN ('open', 'locked', 'live')
        ORDER BY created_at DESC LIMIT 1`
    );
    if (rows.length === 0) return null;
    const cycle = this.mapCycle(rows[0]);
    const picks = await this.getPicks(cycle.id);
    return { cycle, picks };
  }

  async getPicks(cycleId: string): Promise<EntryPick[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM entry_picks WHERE cycle_id = $1 ORDER BY placed_at ASC`,
      [cycleId]
    );
    return rows.map((r) => this.mapPick(r));
  }

  // ----------------------------------------------------------- open a cycle

  /**
   * Open a new entry cycle: source the battle pair from Audius and start the
   * queue window. Fails if a cycle is already open/live (v1 single-slot).
   */
  async openCycle(genre?: string): Promise<EntryCycle> {
    const existing = await this.getCurrentCycle();
    if (existing) {
      throw new Error(
        `A cycle is already ${existing.cycle.status}. v1 runs one slot at a time.`
      );
    }

    const [trackA, trackB] = await this.audius.pullBattlePair(genre);
    const closesAt = new Date(Date.now() + this.cfg.queueWindowSeconds * 1000);

    const { rows } = await this.pool.query(
      `INSERT INTO entry_cycles
         (status, artist_a_track_url, artist_b_track_url,
          artist_a_wallet, artist_b_wallet, queue_closes_at)
       VALUES ('open', $1, $2, $3, $4, $5)
       RETURNING *`,
      [
        trackA.trackUrl,
        trackB.trackUrl,
        this.cfg.artistAWallet,
        this.cfg.artistBWallet,
        closesAt.toISOString(),
      ]
    );
    const cycle = this.mapCycle(rows[0]);
    console.log(
      `[entry-cycle] opened ${cycle.id} | A=${trackA.artistName} B=${trackB.artistName} | closes ${closesAt.toISOString()}`
    );
    return cycle;
  }

  // -------------------------------------------------------------- place pick

  /**
   * Place (or update) a pick during the open window. Commitment only — no
   * on-chain action. Enforces the per-actor budget cap. A human pick carrying
   * controlsAgentId stands that agent down (override).
   */
  async placePick(input: PlacePickInput): Promise<EntryPick> {
    const current = await this.getCurrentCycle();
    if (!current || current.cycle.status !== 'open') {
      throw new Error('No open entry cycle accepting picks right now.');
    }
    if (input.maxBudgetWei <= 0n) {
      throw new Error('maxBudgetWei must be positive.');
    }
    if (input.maxBudgetWei > this.cfg.agentMaxBudgetWei) {
      throw new Error(
        `maxBudgetWei exceeds per-battle cap (${this.cfg.agentMaxBudgetWei.toString()} wei).`
      );
    }
    if (input.actorType === 'agent' && !input.x402TxHash) {
      throw new Error('Agent picks require an x402 settlement proof (x402TxHash).');
    }

    const cycleId = current.cycle.id;
    const autonomy: EntryAutonomy = input.autonomy ?? 'agent';

    const { rows } = await this.pool.query(
      `INSERT INTO entry_picks
         (cycle_id, actor_type, actor_id, side_is_artist_a,
          max_budget_wei, autonomy, controls_agent_id, x402_tx_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (cycle_id, actor_type, actor_id)
       DO UPDATE SET
         side_is_artist_a = EXCLUDED.side_is_artist_a,
         max_budget_wei   = EXCLUDED.max_budget_wei,
         autonomy         = EXCLUDED.autonomy,
         controls_agent_id = EXCLUDED.controls_agent_id,
         x402_tx_hash     = EXCLUDED.x402_tx_hash,
         placed_at        = NOW()
       RETURNING *`,
      [
        cycleId,
        input.actorType,
        input.actorId,
        input.sideIsArtistA,
        input.maxBudgetWei.toString(),
        autonomy,
        input.controlsAgentId ?? null,
        input.x402TxHash ?? null,
      ]
    );

    // Human override: the controlled agent stands down for the live window.
    if (input.actorType === 'human' && input.controlsAgentId) {
      await this.pool.query(
        `UPDATE entry_picks SET autonomy = 'self'
          WHERE cycle_id = $1 AND actor_type = 'agent' AND actor_id = $2`,
        [cycleId, input.controlsAgentId]
      );
      console.log(
        `[entry-cycle] human ${input.actorId} overrode agent ${input.controlsAgentId}`
      );
    }

    return this.mapPick(rows[0]);
  }

  // ------------------------------------------------------ state-machine tick

  /**
   * Advance the cycle. Safe to call on an interval / cron. Idempotent-ish:
   * guarded against re-entrancy within a process.
   */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const current = await this.getCurrentCycle();
      if (!current) return;
      const { cycle } = current;
      const now = Date.now();

      if (cycle.status === 'open' && now >= cycle.queueClosesAt.getTime()) {
        await this.lockAndStart(cycle);
      } else if (
        cycle.status === 'live' &&
        cycle.battleEndsAt &&
        now >= cycle.battleEndsAt.getTime()
      ) {
        await this.settle(cycle);
      }
    } catch (err) {
      console.error('[entry-cycle] tick error:', err);
    } finally {
      this.ticking = false;
    }
  }

  /** Close the queue, create the on-chain battle, open the live window. */
  private async lockAndStart(cycle: EntryCycle): Promise<void> {
    const battleId = await this.nextBattleId();
    const startTime = Math.floor(Date.now() / 1000) + START_BUFFER_SECONDS;
    const duration = this.cfg.battleDurationSeconds;

    console.log(`[entry-cycle] locking ${cycle.id} -> battle ${battleId}`);
    await this.pool.query(
      `UPDATE entry_cycles SET status = 'locked', battle_id = $2 WHERE id = $1`,
      [cycle.id, battleId]
    );

    const txHash = await this.blockchain.initializeBattle({
      battleId,
      battleDuration: duration,
      startTime,
      artistAWallet: cycle.artistAWallet ?? this.cfg.artistAWallet,
      artistBWallet: cycle.artistBWallet ?? this.cfg.artistBWallet,
      wavewarzWallet: this.cfg.wavewarzWallet,
      paymentToken: this.cfg.paymentToken,
    });
    console.log(`[entry-cycle] initializeBattle ${battleId} tx ${txHash}`);

    const startedAt = new Date(startTime * 1000);
    const endsAt = new Date((startTime + duration) * 1000);
    await this.pool.query(
      `UPDATE entry_cycles
          SET status = 'live', battle_started_at = $2, battle_ends_at = $3
        WHERE id = $1`,
      [cycle.id, startedAt.toISOString(), endsAt.toISOString()]
    );

    // Deploy agent commitments at live-open (default path). Humans with
    // autonomy='self' trade live via the frontend with their own wallet.
    await this.deployAgentCommitments(cycle.id, battleId);
  }

  /**
   * Submit each agent commitment as an on-chain buy. Best-effort: a failed
   * deploy (e.g. window not yet open) is left unexecuted for retry on the
   * next tick. Humans (autonomy='self') are skipped.
   */
  private async deployAgentCommitments(cycleId: string, battleId: number): Promise<void> {
    const picks = await this.getPicks(cycleId);
    for (const pick of picks) {
      if (pick.executed) continue;
      if (pick.actorType !== 'agent' || pick.autonomy !== 'agent') continue;

      const side: 'A' | 'B' = pick.sideIsArtistA ? 'A' : 'B';
      const result = await this.tradeExecutor.executeBuyTrade(
        battleId,
        pick.actorId,
        BigInt(pick.maxBudgetWei),
        side
      );
      if (result.success) {
        await this.pool.query(
          `UPDATE entry_picks SET executed = TRUE WHERE id = $1`,
          [pick.id]
        );
        console.log(
          `[entry-cycle] agent ${pick.actorId} deployed ${pick.maxBudgetWei} wei on ${side} tx ${result.txHash}`
        );
      } else {
        console.warn(
          `[entry-cycle] agent ${pick.actorId} deploy failed: ${result.error}`
        );
      }
    }
  }

  /** Resolve on trading dominance and settle on-chain. */
  private async settle(cycle: EntryCycle): Promise<void> {
    if (cycle.battleId == null) throw new Error('Cannot settle: no battleId');

    const onchain = await this.blockchain.getBattle(cycle.battleId);
    if (!onchain) throw new Error(`On-chain battle ${cycle.battleId} not found`);

    // Trading dominance = the larger backing pool.
    const winnerIsArtistA = onchain.artistAPool >= onchain.artistBPool;
    console.log(
      `[entry-cycle] settling battle ${cycle.battleId} | A=${onchain.artistAPool} B=${onchain.artistBPool} -> winner ${winnerIsArtistA ? 'A' : 'B'}`
    );

    const txHash = await this.blockchain.endBattle(cycle.battleId, winnerIsArtistA);
    console.log(`[entry-cycle] endBattle ${cycle.battleId} tx ${txHash}`);

    await this.pool.query(
      `UPDATE entry_cycles
          SET status = 'settled', winner_is_artist_a = $2, settled_at = NOW()
        WHERE id = $1`,
      [cycle.id, winnerIsArtistA]
    );
  }

  // ------------------------------------------------------------- internals

  private async nextBattleId(): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COALESCE(MAX(battle_id), $1) AS max_id FROM entry_cycles`,
      [ENTRY_BATTLE_ID_BASE]
    );
    return Number(rows[0].max_id) + 1;
  }

  private mapCycle(r: any): EntryCycle {
    return {
      id: r.id,
      battleId: r.battle_id == null ? null : Number(r.battle_id),
      status: r.status,
      artistATrackUrl: r.artist_a_track_url,
      artistBTrackUrl: r.artist_b_track_url,
      artistAWallet: r.artist_a_wallet,
      artistBWallet: r.artist_b_wallet,
      queueOpenedAt: new Date(r.queue_opened_at),
      queueClosesAt: new Date(r.queue_closes_at),
      battleStartedAt: r.battle_started_at ? new Date(r.battle_started_at) : null,
      battleEndsAt: r.battle_ends_at ? new Date(r.battle_ends_at) : null,
      winnerIsArtistA: r.winner_is_artist_a,
      settledAt: r.settled_at ? new Date(r.settled_at) : null,
    };
  }

  private mapPick(r: any): EntryPick {
    return {
      id: r.id,
      cycleId: r.cycle_id,
      actorType: r.actor_type,
      actorId: r.actor_id,
      sideIsArtistA: r.side_is_artist_a,
      maxBudgetWei: String(r.max_budget_wei),
      autonomy: r.autonomy,
      controlsAgentId: r.controls_agent_id,
      x402TxHash: r.x402_tx_hash,
      executed: r.executed,
      placedAt: new Date(r.placed_at),
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
