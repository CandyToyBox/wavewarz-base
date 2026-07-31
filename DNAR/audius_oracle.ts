/**
 * audius_oracle.ts
 * ─────────────────────────────────────────────────────────
 *  WaveWarz Audius Oracle Service
 *  Polls the Audius API for live stream counts and:
 *    1. Pushes stream data on-chain via update_stream_data
 *    2. Triggers adapt_nft_price for all active battle NFTs
 *    3. Pushes new Metaplex metadata URIs reflecting battle phase
 * ─────────────────────────────────────────────────────────
 */

import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
} from "@solana/web3.js";
import { AnchorProvider, Program, web3, BN } from "@coral-xyz/anchor";
import { Metaplex, keypairIdentity } from "@metaplex-foundation/js";
import { sdk as AudiusSDK } from "@audius/sdk";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// ── Config ──────────────────────────────────────────────────
const RPC_URL        = process.env.SOLANA_RPC_URL!;
const ORACLE_KEY     = JSON.parse(fs.readFileSync(process.env.ORACLE_KEYPAIR_PATH!, "utf-8"));
const PROGRAM_ID     = new PublicKey(process.env.PROGRAM_ID!);
const POLL_INTERVAL  = 30_000; // 30 seconds
const METADATA_BASE  = process.env.METADATA_API_URL!; // e.g. your IPFS/Arweave pinning service

// ── Audius Phase Thresholds ─────────────────────────────────
const PHASE_THRESHOLDS = {
  HEATING:    0.55,  // >55% stream share
  DOMINATING: 0.70,  // >70% stream share
};

async function main() {
  const connection   = new Connection(RPC_URL, "confirmed");
  const oracleKeypair = Keypair.fromSecretKey(Uint8Array.from(ORACLE_KEY));
  const provider     = new AnchorProvider(connection, { publicKey: oracleKeypair.publicKey, signTransaction: async (tx) => { tx.partialSign(oracleKeypair); return tx; }, signAllTransactions: async (txs) => txs.map(tx => { tx.partialSign(oracleKeypair); return tx; }) }, {});
  const metaplex     = Metaplex.make(connection).use(keypairIdentity(oracleKeypair));

  // Load IDL
  const idl = JSON.parse(fs.readFileSync("./target/idl/wavewarz_dynamic_nft.json", "utf-8"));
  const program = new Program(idl, PROGRAM_ID, provider);

  // Init Audius SDK
  const audius = await AudiusSDK.init({
    appName: "WaveWarz Oracle",
    apiKey: process.env.AUDIUS_API_KEY!,
    apiSecret: process.env.AUDIUS_API_SECRET!,
    environment: "production",
  });

  console.log("🎵 WaveWarz Audius Oracle started");
  console.log(`   Oracle: ${oracleKeypair.publicKey.toBase58()}`);

  // ── Poll loop ─────────────────────────────────────────────
  while (true) {
    try {
      await pollAndUpdate(program, audius, metaplex, connection, oracleKeypair);
    } catch (err) {
      console.error("Oracle poll error:", err);
    }
    await sleep(POLL_INTERVAL);
  }
}

async function pollAndUpdate(
  program: Program,
  audius: any,
  metaplex: Metaplex,
  connection: Connection,
  oracle: Keypair,
) {
  // Fetch all active battles
  const battles = await program.account.battle.all([
    { memcmp: { offset: 8 + 32 + 32 + 32 + 32 + 200 + 8 + 8 + 2 + 2, bytes: "1" } }, // status = Active (simplified)
  ]);

  for (const { publicKey: battlePda, account: battle } of battles) {
    const trackIdA = battle.audiusTrackIdA;
    const trackIdB = battle.audiusTrackIdB;

    // ── Fetch Audius stream data ─────────────────────────────
    let streamCountA = 0n;
    let streamCountB = 0n;
    try {
      const trackA = await audius.tracks.getTrack({ trackId: extractTrackId(trackIdA) });
      const trackB = await audius.tracks.getTrack({ trackId: extractTrackId(trackIdB) });
      streamCountA = BigInt(trackA.data?.playCount ?? 0);
      streamCountB = BigInt(trackB.data?.playCount ?? 0);
    } catch (e) {
      console.warn(`  Could not fetch Audius data for battle ${battle.battleId}:`, e);
      continue;
    }

    console.log(`\n🎶 Battle ${battle.battleId}: A=${streamCountA} B=${streamCountB}`);

    // ── Push stream data on-chain ────────────────────────────
    try {
      await program.methods
        .updateStreamData(
          new BN(streamCountA.toString()),
          new BN(streamCountB.toString()),
          new BN(Math.floor(Date.now() / 1000)),
        )
        .accounts({
          battle: battlePda,
          config: findConfigPda(program.programId),
          oracle: oracle.publicKey,
        })
        .signers([oracle])
        .rpc();
      console.log(`  ✅ Stream data updated on-chain`);
    } catch (e) {
      console.error(`  ❌ Failed to update stream data:`, e);
    }

    // ── Fetch all NFTs in this battle and adapt prices ───────
    const nfts = await program.account.nftState.all([
      { memcmp: { offset: 8, bytes: new BN(battle.battleId).toBuffer("le", 8).toString("base64") } },
    ]);

    for (const { publicKey: nftPda, account: nftState } of nfts) {
      // adapt_nft_price
      try {
        await program.methods
          .adaptNftPrice()
          .accounts({
            nftState: nftPda,
            battle: battlePda,
            payer: oracle.publicKey,
          })
          .signers([oracle])
          .rpc();
      } catch (e) {
        // likely cooldown — ignore
      }

      // Determine visual battle phase
      const totalStreams = streamCountA + streamCountB;
      const myStreams = nftState.side.a !== undefined ? streamCountA : streamCountB;
      const share = totalStreams > 0n ? Number(myStreams) / Number(totalStreams) : 0.5;

      let phase: string;
      if (share >= PHASE_THRESHOLDS.DOMINATING) phase = "Dominating";
      else if (share >= PHASE_THRESHOLDS.HEATING) phase = "Heating";
      else phase = "Live";

      // Push new metadata URI with dynamic phase image
      const newUri = `${METADATA_BASE}/battle/${battle.battleId}/side/${nftState.side.a !== undefined ? "a" : "b"}/phase/${phase.toLowerCase()}.json`;

      try {
        await program.methods
          .updateMetadataUri(newUri, { [phase.charAt(0).toLowerCase() + phase.slice(1)]: {} })
          .accounts({
            nftState: nftPda,
            config: findConfigPda(program.programId),
            authority: oracle.publicKey,
          })
          .signers([oracle])
          .rpc();
        console.log(`  🖼️  NFT ${nftState.mint.toBase58().slice(0, 8)}… phase → ${phase}`);
      } catch (e) {
        console.error(`  Failed to update metadata URI:`, e);
      }

      // ── Metaplex: update on-chain metadata ──────────────────
      try {
        const nft = await metaplex.nfts().findByMint({ mintAddress: nftState.mint });
        await metaplex.nfts().update({
          nftOrSft: nft,
          uri: newUri,
          name: `WaveWarz Battle #${battle.battleId} – ${nftState.side.a !== undefined ? "Artist A" : "Artist B"} [${phase}]`,
          creators: [
            {
              address: nftState.artist,
              share: nftState.royaltyBps / 100, // Metaplex uses 0-100
              verified: false,
            },
          ],
          sellerFeeBasisPoints: nftState.royaltyBps, // 100–1000 (1%–10%)
        });
        console.log(`  📝 Metaplex metadata updated`);
      } catch (e) {
        console.error(`  Metaplex update failed:`, e);
      }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────

function findConfigPda(programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  return pda;
}

function extractTrackId(audiusTrackId: string): string {
  // "audius:track:XXXXX" → "XXXXX"
  return audiusTrackId.split(":").pop() ?? audiusTrackId;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch(console.error);
