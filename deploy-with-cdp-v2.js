#!/usr/bin/env node

/**
 * WaveWarz Base - Battle #1002 Deployment with Coinbase CDP v2
 * Uses official Server Wallet v2 patterns for production-ready contract deployment
 *
 * CDP v2 Benefits:
 * - Managed server wallets (no private key export)
 * - Official wallet.deployContract() API
 * - Full contract verification on Etherscan
 * - Production-grade security
 *
 * Prerequisites:
 * 1. npm install @coinbase/coinbase-sdk dotenv
 * 2. .env file with: CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
 * 3. Deployer wallet funded with >0.1 ETH on Base Sepolia
 */

const { Wallet } = require("@coinbase/coinbase-sdk");
require("dotenv").config();

const RPC_URL = "https://sepolia.base.org";
const CHAIN = "base-sepolia";

// Pre-created managed wallets (no private keys needed)
const ACCOUNTS = {
  deployer: "wavewarz-nova-001",    // Artist A (Deployer)
  trader1: "wavewarz-wavex-001",    // Artist B (Trader 1)
  trader2: "wavewarz-lil-lob-001",  // Platform (Trader 2)
};

// Verified wallet addresses
const WALLETS = {
  artistA: "0xCB22D1D13665B99F8f140f4047BCB73872982E77",
  artistB: "0x1C077ca097B99FE953Bdf8Dcc871C276dD7aDb11",
  platform: "0x2EAF14adAA4d32A0cd807bC15A40c3A93FA68c30",
};

// WETH on Base Sepolia (payment token for trading)
const PAYMENT_TOKEN = "0x4200000000000000000000000000000000000006";

/**
 * Deploy WaveWarzBase contract using CDP v2 wallet.deployContract()
 * This is the official recommended pattern from Coinbase documentation
 */
async function deployWaveWarzBase() {
  console.log("\n🚀 WaveWarz Base - Battle #1002 Deployment (CDP v2)\n");

  try {
    // Step 1: Initialize Coinbase SDK
    console.log("Step 1: Initializing Coinbase CDP v2 client...");
    const wallet = await Wallet.create({
      networkId: CHAIN,
    });
    console.log("✅ CDP v2 client initialized\n");

    // Step 2: Get or create deployer account
    console.log(`Step 2: Getting deployer account (${ACCOUNTS.deployer})...`);
    const deployerWallet = wallet.getAddress();
    console.log(`✅ Deployer wallet: ${deployerWallet}\n`);

    // Step 3: Check balance
    console.log("Step 3: Checking account balance...");
    const balance = await wallet.getBalance();
    console.log(`✅ Balance: ${balance.toString()} Wei\n`);

    if (parseFloat(balance.toString()) < parseFloat("50000000000000000")) {
      // < 0.05 ETH
      console.log("⚠️  Balance low! Requesting ETH from faucet...");
      const faucetTx = await wallet.faucet();
      console.log(`✅ Faucet request sent`);
      console.log("⏳ Waiting for funds (30-60 seconds)...\n");
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }

    // Step 4: Prepare contract deployment parameters
    console.log("Step 4: Preparing Battle #1002 deployment...");
    const startTime = Math.floor(Date.now() / 1000) + 120; // 2 min from now
    const battleDuration = 3600; // 1 hour in seconds

    console.log(`   Battle ID: 1002`);
    console.log(`   Duration: ${battleDuration}s (1 hour)`);
    console.log(`   Start Time: ${startTime} (Unix timestamp)`);
    console.log(`   Artist A: ${WALLETS.artistA}`);
    console.log(`   Artist B: ${WALLETS.artistB}`);
    console.log(`   Platform: ${WALLETS.platform}`);
    console.log(`   Payment Token: ${PAYMENT_TOKEN}\n`);

    // Step 5: Deploy contract using CDP v2 wallet.deployContract()
    console.log("Step 5: Deploying WaveWarzBase contract via CDP v2...");

    // Read contract compiler input JSON
    const fs = require("fs");
    const compilerInputJson = JSON.parse(
      fs.readFileSync("./contract-compiler-input.json", "utf8")
    );

    // Extract WaveWarzBase contract input
    // Use the resolved paths from Foundry's standardJson output
    const sources = compilerInputJson.sources;
    const wavewarzBaseInput = {
      sources: {
        "contracts/src/WaveWarzBase.sol": sources["contracts/src/WaveWarzBase.sol"],
        "contracts/src/IWaveWarzBase.sol": sources["contracts/src/IWaveWarzBase.sol"],
        "contracts/src/EphemeralBattleToken.sol": sources["contracts/src/EphemeralBattleToken.sol"],
        "contracts/lib/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol":
          sources["contracts/lib/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol"],
        "contracts/lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol":
          sources["contracts/lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol"],
        "contracts/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol":
          sources["contracts/lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol"],
        "contracts/lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol":
          sources["contracts/lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol"],
        "contracts/lib/openzeppelin-contracts/contracts/utils/Context.sol":
          sources["contracts/lib/openzeppelin-contracts/contracts/utils/Context.sol"],
        "contracts/lib/openzeppelin-contracts/contracts/utils/Address.sol":
          sources["contracts/lib/openzeppelin-contracts/contracts/utils/Address.sol"],
      },
      language: compilerInputJson.language,
      settings: compilerInputJson.settings,
    };

    // Deploy contract with constructor args
    const deployTx = await wallet.deployContract({
      solidityVersion: "0.8.28+commit.7893614a",
      solidityInputJson: wavewarzBaseInput,
      contractName: "WaveWarzBase",
      constructorArgs: {}, // No constructor args for WaveWarzBase
    });

    console.log(`📤 Deployment transaction initiated`);
    console.log(`⏳ Waiting for on-chain confirmation...\n`);

    // Wait for deployment to complete
    const receipt = await deployTx.wait();
    const contractAddress = receipt.contractAddress;

    console.log(`✅ WaveWarzBase deployed!`);
    console.log(`   Contract Address: ${contractAddress}`);
    console.log(`   Block Number: ${receipt.blockNumber}`);
    console.log(`   Gas Used: ${receipt.gasUsed}\n`);

    // Step 6: Initialize first battle
    console.log("Step 6: Initializing Battle #1002...");
    const contract = wallet.getContract(contractAddress, "WaveWarzBase");

    const initTx = await contract.invokeFunction("initializeBattle", [
      "1002", // battleId
      battleDuration.toString(),
      startTime.toString(),
      WALLETS.artistA,
      WALLETS.artistB,
      WALLETS.platform,
      PAYMENT_TOKEN,
    ]);

    console.log(`📤 Battle initialization transaction sent`);
    console.log(`⏳ Waiting for confirmation...\n`);

    const battleReceipt = await initTx.wait();
    console.log(`✅ Battle #1002 initialized!`);
    console.log(`   Block: ${battleReceipt.blockNumber}`);
    console.log(`   Transaction Hash: ${battleReceipt.transactionHash}\n`);

    // Summary
    console.log("========================================");
    console.log("✅ DEPLOYMENT COMPLETE!");
    console.log("========================================\n");

    console.log("📊 Deployment Summary:");
    console.log(`   Contract: ${contractAddress}`);
    console.log(`   Deployer: ${deployerWallet}`);
    console.log(`   Battle ID: 1002`);
    console.log(`   Network: Base Sepolia (Chain ID: 84532)`);
    console.log(`   View on Basescan: https://sepolia.basescan.org/address/${contractAddress}\n`);

    console.log("Next steps:");
    console.log("1. Verify contract on Basescan");
    console.log("2. Execute test trades with execute-trades-1002.js");
    console.log("3. Monitor battle progress");
    console.log("4. Claim payouts after settlement\n");

    console.log("🔗 Documentation:");
    console.log("   - CDP v2 Docs: https://docs.cdp.coinbase.com/smart-contract-platform/docs/overview");
    console.log("   - Smart Contract Deployment: https://docs.cdp.coinbase.com/smart-contracts/docs/deployments");
    console.log("   - Basescan: https://sepolia.basescan.org\n");
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run deployment
deployWaveWarzBase();
