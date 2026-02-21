#!/usr/bin/env node

/**
 * WaveWarz Base - Battle #1002 Deployment
 * Using Coinbase CDP Server Wallet v2
 *
 * Prerequisites:
 * 1. npm install @coinbase/cdp-sdk viem dotenv
 * 2. Set environment: CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
 * 3. Your accounts already exist in CDP:
 *    - wavewarz-nova-001: 0xCB22D1D13665B99F8f140f4047BCB73872982E77
 *    - wavewarz-wavex-001: 0x1C077ca097B99FE953Bdf8Dcc871C276dD7aDb11
 *    - wavewarz-lil-lob-001: 0x2EAF14adAA4d32A0cd807bC15A40c3A93FA68c30
 */

const { CdpClient } = require("@coinbase/cdp-sdk");
const { http, createPublicClient, formatEther, parseEther } = require("viem");
const { baseSepolia } = require("viem/chains");
require("dotenv").config();

const RPC_URL = "https://sepolia.base.org";
const CONTRACT_ADDRESS = "0xe28709DF5c77eD096f386510240A4118848c1098";

// Your CDP accounts (already created in your dashboard)
const ACCOUNTS = {
  deployer: "wavewarz-nova-001", // Artist A
  trader1: "wavewarz-wavex-001", // Artist B
  trader2: "wavewarz-lil-lob-001", // Platform
};

// Verified wallet addresses
const WALLETS = {
  artistA: "0xCB22D1D13665B99F8f140f4047BCB73872982E77",
  artistB: "0x1C077ca097B99FE953Bdf8Dcc871C276dD7aDb11",
  platform: "0x2EAF14adAA4d32A0cd807bC15A40c3A93FA68c30",
};

async function main() {
  console.log("\n🚀 WaveWarz Base - Battle #1002 Deployment\n");

  try {
    // Initialize CDP
    console.log("Step 1: Initializing Coinbase CDP...");
    const cdp = new CdpClient();
    console.log("✅ CDP initialized\n");

    // Get deployer account
    console.log(`Step 2: Getting deployer account (${ACCOUNTS.deployer})...`);
    const deployerAccount = await cdp.evm.getOrCreateAccount(ACCOUNTS.deployer);
    console.log(`✅ Deployer address: ${deployerAccount.address}\n`);

    // Check balance
    console.log("Step 3: Checking balance...");
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(RPC_URL),
    });

    const balance = await publicClient.getBalance({
      address: deployerAccount.address,
    });

    const balanceEth = parseFloat(formatEther(balance));
    console.log(`✅ Balance: ${balanceEth.toFixed(4)} ETH`);

    if (balanceEth < 0.05) {
      console.log("\n⚠️  Balance low! Requesting ETH from faucet...");
      const faucetTx = await cdp.evm.requestFaucet({
        address: deployerAccount.address,
        network: "base-sepolia",
        token: "eth",
      });
      console.log(`✅ Faucet tx: ${faucetTx.transactionHash}`);
      console.log("⏳ Waiting for confirmation...");
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    // Deploy Battle #1002
    console.log("\nStep 4: Deploying Battle #1002...");
    const startTime = Math.floor(Date.now() / 1000) + 120;
    const battleDuration = 3600;

    console.log(`   Battle ID: 1002`);
    console.log(`   Duration: ${battleDuration}s (1 hour)`);
    console.log(`   Start time: ${startTime}`);
    console.log(`   Artist A: ${WALLETS.artistA}`);
    console.log(`   Artist B: ${WALLETS.artistB}`);
    console.log(`   Platform: ${WALLETS.platform}`);

    // NOTE: In production, you would encode the actual contract call here
    // For now, this shows the structure. You'd need to:
    // 1. Use ethers.js Interface to encode the initializeBattle call
    // 2. Or call the contract directly via CDP sendTransaction

    console.log(`\n✅ Deployment prepared!`);
    console.log(`\nNext steps:`);
    console.log(`1. Use CDP dashboard to send transaction to contract`);
    console.log(`2. Or use ethers.js to encode and send via CDP`);
    console.log(`\nFor full deployment, see: /tmp/DEPLOYMENT_AND_AGENT_EXECUTION_PLAN.md\n`);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main();
