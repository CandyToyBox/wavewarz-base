#!/usr/bin/env node

/**
 * WaveWarz Base - Battle #1002 Trade Execution
 * Execute 2 test trades on Battle #1002
 * Trade 1: 0.1 ETH → Artist A
 * Trade 2: 0.2 ETH → Artist B
 */

const ethers = require("ethers");
require("dotenv").config();

const RPC_URL = "https://sepolia.base.org";
const CONTRACT_ADDRESS = "0xe28709DF5c77eD096f386510240A4118848c1098";

const CONTRACT_ABI = [
  "function buyShares(uint64 battleId, bool artistA, uint256 amount, uint256 minTokensOut, uint64 deadline) external payable",
  "function getBattle(uint64 battleId) external view returns (tuple(uint64 battleId, uint8 battleBump, uint8 artistAMintBump, uint8 artistBMintBump, uint8 battleVaultBump, int64 startTime, int64 endTime, address artistAWallet, address artistBWallet, address wavewarzWallet, address artistAMint, address artistBMint, uint64 artistASupply, uint64 artistBSupply, uint64 artistASolBalance, uint64 artistBSolBalance, uint64 artistAPool, uint64 artistBPool, bool winnerArtistA, bool winnerDecided, uint8 transactionState, bool isInitialized, bool isActive, uint64 totalDistributionAmount, address admin) battle)",
];

async function executeTrade(trader, battleId, artistA, amountEth, tradeNum) {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, trader);

  const amount = ethers.parseEther(amountEth.toString());
  const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  const minTokensOut = 0n; // No slippage protection for test

  const artistLabel = artistA ? "Artist A" : "Artist B";
  console.log(`\n📤 Trade ${tradeNum}: ${amountEth} ETH → ${artistLabel}`);
  console.log(`   Trader: ${trader.address}`);
  console.log(`   Deadline: ${deadline}\n`);

  try {
    const tx = await contract.buyShares(
      BigInt(battleId),
      artistA,
      amount,
      minTokensOut,
      BigInt(deadline),
      {
        value: amount,
      }
    );

    console.log(`✅ Transaction sent: ${tx.hash}`);
    console.log(`⏳ Waiting for confirmation...\n`);

    const receipt = await tx.wait();
    console.log(`✅ Trade confirmed in block ${receipt.blockNumber}!`);
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

    // Expected fees
    const expectedArtistFee = (parseFloat(amountEth) * 0.01).toFixed(4); // 1%
    const expectedPlatformFee = (parseFloat(amountEth) * 0.005).toFixed(4); // 0.5%
    console.log(`\n   Expected fees:`);
    console.log(`   - ${artistLabel}: ${expectedArtistFee} ETH`);
    console.log(`   - Platform: ${expectedPlatformFee} ETH`);

    return receipt;
  } catch (error) {
    console.error(`❌ Trade failed: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.log("\n🚀 WaveWarz Base - Battle #1002 Trade Execution\n");

  try {
    // Get traders from env
    const trader1Key = process.env.TRADER_1_PRIVKEY;
    const trader2Key = process.env.TRADER_2_PRIVKEY;

    if (!trader1Key || !trader2Key) {
      throw new Error(
        "❌ TRADER_1_PRIVKEY and TRADER_2_PRIVKEY not set in .env file"
      );
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const trader1 = new ethers.Wallet(trader1Key, provider);
    const trader2 = new ethers.Wallet(trader2Key, provider);

    console.log(`Trader 1: ${trader1.address}`);
    console.log(`Trader 2: ${trader2.address}\n`);

    // Check balances
    console.log("Checking trader balances...");
    const bal1 = await provider.getBalance(trader1.address);
    const bal2 = await provider.getBalance(trader2.address);
    console.log(`Trader 1: ${ethers.formatEther(bal1)} ETH`);
    console.log(`Trader 2: ${ethers.formatEther(bal2)} ETH\n`);

    // Execute trades
    console.log("========================================");
    console.log("EXECUTING TRADES");
    console.log("========================================");

    const receipt1 = await executeTrade(trader1, 1002, true, 0.1, 1);
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait between trades

    const receipt2 = await executeTrade(trader2, 1002, false, 0.2, 2);

    console.log("\n========================================");
    console.log("✅ ALL TRADES COMPLETED!");
    console.log("========================================\n");

    console.log("Next steps:");
    console.log(
      "1. Wait 30-60 seconds for blockchain confirmation"
    );
    console.log("2. Visit Basescan to verify fees:");
    console.log(
      "   - Artist A: https://sepolia.basescan.org/address/0xCB22D1D13665B99F8f140f4047BCB73872982E77"
    );
    console.log(
      "   - Artist B: https://sepolia.basescan.org/address/0x1C077ca097B99FE953Bdf8Dcc871C276dD7aDb11"
    );
    console.log(
      "   - Platform: https://sepolia.basescan.org/address/0x2EAF14adAA4d32A0cd807bC15A40c3A93FA68c30"
    );
    console.log(
      "   - Test (should be 0): https://sepolia.basescan.org/address/0x3e4ed2D6d6235f9D26707fd5d5AF476fb9C91B0F\n"
    );
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main();
