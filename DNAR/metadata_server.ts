/**
 * metadata_server.ts
 * ─────────────────────────────────────────────────────────
 *  Dynamic NFT Metadata API for WaveWarz Battle NFTs
 *  Serves phase-adaptive metadata JSON consumed by wallets,
 *  marketplaces, and the Audius Oracle.
 *
 *  Endpoint: GET /battle/:battleId/side/:side/phase/:phase.json
 * ─────────────────────────────────────────────────────────
 */

import express from "express";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import * as fs from "fs";
import * as dotenv from "dotenv";
dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3001;
const RPC  = process.env.SOLANA_RPC_URL!;
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID!);

// Phase → visual image IPFS CID map (populate with your assets)
const PHASE_IMAGES: Record<string, Record<string, string>> = {
  a: {
    live:       "ipfs://QmArtistA_Live",
    heating:    "ipfs://QmArtistA_Heating",
    dominating: "ipfs://QmArtistA_Dominating",
    won:        "ipfs://QmArtistA_Won",
    lost:       "ipfs://QmArtistA_Lost",
  },
  b: {
    live:       "ipfs://QmArtistB_Live",
    heating:    "ipfs://QmArtistB_Heating",
    dominating: "ipfs://QmArtistB_Dominating",
    won:        "ipfs://QmArtistB_Won",
    lost:       "ipfs://QmArtistB_Lost",
  },
};

// ── NFT Metadata Schema ──────────────────────────────────────
function buildMetadata(params: {
  battleId: number;
  side: "a" | "b";
  phase: string;
  artistName: string;
  trackTitle: string;
  audiusTrackId: string;
  streamCount: number;
  currentPrice: number;
  royaltyBps: number;
  wavewarzUrl: string;
}) {
  const {
    battleId, side, phase, artistName, trackTitle,
    audiusTrackId, streamCount, currentPrice, royaltyBps, wavewarzUrl,
  } = params;

  return {
    name: `WaveWarz Battle #${battleId} – ${artistName} [${phase.toUpperCase()}]`,
    symbol: "WWARZ",
    description:
      `Dynamic NFT for ${artistName} competing in WaveWarz Battle #${battleId}. ` +
      `This NFT adapts in real-time based on Audius stream counts and fan votes. ` +
      `Artist royalty: ${royaltyBps / 100}%.`,
    image: PHASE_IMAGES[side]?.[phase] ?? PHASE_IMAGES[side]?.live,
    animation_url: `https://wavewarz.com/battle/${battleId}/live`,
    external_url: wavewarzUrl,
    seller_fee_basis_points: royaltyBps,
    attributes: [
      { trait_type: "Battle ID",     value: battleId },
      { trait_type: "Side",          value: side.toUpperCase() },
      { trait_type: "Battle Phase",  value: phase },
      { trait_type: "Artist",        value: artistName },
      { trait_type: "Track",         value: trackTitle },
      { trait_type: "Audius Streams",value: streamCount },
      { trait_type: "Current Price", value: `${currentPrice} lamports` },
      { trait_type: "Royalty",       value: `${royaltyBps / 100}%` },
    ],
    properties: {
      category: "audio",
      files: [
        {
          uri:  `https://audius.co/tracks/${audiusTrackId}`,
          type: "audio/mpeg",
        },
        {
          uri:  PHASE_IMAGES[side]?.[phase],
          type: "image/png",
        },
      ],
      creators: [
        {
          address: "ARTIST_WALLET_PUBKEY",
          share: royaltyBps / 100,
        },
      ],
    },
    // WaveWarz-specific extension
    wavewarz: {
      battle_id:        battleId,
      side,
      phase,
      audius_track_id:  audiusTrackId,
      live_battle_url:  wavewarzUrl,
      royalty_pct:      royaltyBps / 100,
    },
  };
}

// ── Routes ───────────────────────────────────────────────────

// Example: GET /battle/1/side/a/phase/heating.json
app.get("/battle/:battleId/side/:side/phase/:phase.json", async (req, res) => {
  try {
    const { battleId, side, phase } = req.params;
    const phaseName = phase.replace(".json", "");

    // In production: fetch live battle state from Solana
    // Here we return a template with placeholders
    const metadata = buildMetadata({
      battleId:      parseInt(battleId),
      side:          side as "a" | "b",
      phase:         phaseName,
      artistName:    `Artist ${side.toUpperCase()}`,
      trackTitle:    `Battle Track ${battleId}`,
      audiusTrackId: `${battleId}${side === "a" ? "000" : "001"}`,
      streamCount:   0, // would be fetched live
      currentPrice:  0,
      royaltyBps:    500, // default 5%, override per NFT
      wavewarzUrl:   `https://wavewarz.com/battle/${battleId}`,
    });

    res.json(metadata);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Metadata generation failed" });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "WaveWarz Metadata API" }));

app.listen(PORT, () => {
  console.log(`🎵 WaveWarz Metadata API running on port ${PORT}`);
});
