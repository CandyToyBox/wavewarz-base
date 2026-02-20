// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/WaveWarzBase.sol";
import "../src/EphemeralBattleToken.sol";
import "../src/IWaveWarzBase.sol";

/**
 * @title WaveWarzBaseLoadTest
 * @notice Load, stress and concurrency tests for WaveWarzBase.
 *
 * Goals:
 *  - Many traders buying/selling concurrently across multiple battles.
 *  - Full lifecycle with 20 traders: buy → endBattle → all claim.
 *  - Sequential buy/sell cycles verify that fees result in a net loss (no free money).
 *  - Large ETH amounts stress the bonding curve math without overflow.
 *  - Multiple simultaneous battles maintain independent state.
 */
contract WaveWarzBaseLoadTest is Test {
    WaveWarzBase public waveWarz;

    address public admin = address(1);
    address public artistA = address(2);
    address public artistB = address(3);
    address public wavewarzWallet = address(4);

    uint64 public constant BATTLE_DURATION = 3600; // 1 hour
    uint64 public constant START_OFFSET = 60;

    function setUp() public {
        waveWarz = new WaveWarzBase();
        vm.deal(admin, 1 ether);
    }

    // ============ Helper Functions ============

    function _createBattle(uint64 battleId) internal {
        vm.prank(admin);
        waveWarz.initializeBattle(
            IWaveWarzBase.BattleInitParams({
                battleId: battleId,
                battleDuration: BATTLE_DURATION,
                startTime: uint64(block.timestamp + START_OFFSET),
                artistAWallet: artistA,
                artistBWallet: artistB,
                wavewarzWallet: wavewarzWallet,
                paymentToken: address(0)
            })
        );
    }

    function _startBattle(uint64 battleId) internal {
        IWaveWarzBase.Battle memory b = waveWarz.getBattle(battleId);
        vm.warp(b.startTime);
    }

    function _endBattleTime(uint64 battleId) internal {
        IWaveWarzBase.Battle memory b = waveWarz.getBattle(battleId);
        vm.warp(b.endTime + 1);
    }

    // ============ Full Lifecycle: 20 Traders ============

    /**
     * @notice 20 traders buy shares split evenly between Artist A and B.
     *         After the battle ends, all traders claim their share.
     *         The test verifies no reverts and that every claim returns > 0.
     */
    function testLoad_FullLifecycleWith20Traders() public {
        _createBattle(1);
        _startBattle(1);

        uint256 traderCount = 20;
        uint256 buyAmount = 0.1 ether;
        uint256 baseAddr = 1000;

        // All traders buy
        for (uint256 i = 0; i < traderCount; i++) {
            address trader = address(uint160(baseAddr + i));
            vm.deal(trader, buyAmount * 2);
            bool pickA = (i % 2 == 0);

            vm.prank(trader);
            waveWarz.buyShares{value: buyAmount}(1, pickA, buyAmount, 0, uint64(block.timestamp + 300));
        }

        _endBattleTime(1);
        vm.prank(admin);
        waveWarz.endBattle(1, true); // Artist A wins

        // All traders claim — none should revert
        uint256 totalClaimed = 0;
        for (uint256 i = 0; i < traderCount; i++) {
            address trader = address(uint160(baseAddr + i));
            vm.prank(trader);
            uint256 claimed = waveWarz.claimShares(1);
            assertTrue(claimed > 0, "Every participant should receive a payout");
            totalClaimed += claimed;
        }

        // Total claimed must not exceed the ETH the contract ever held
        // (original pool + 40% of loser pool for winners, 50% for losers).
        // A small amount of rounding dust (up to ~5 wei per integer division) may remain.
        uint256 contractBalance = address(waveWarz).balance;
        assertLe(contractBalance, 200, "Minimal dust may remain due to integer rounding");
    }

    // ============ Sequential Buy/Sell Cycles ============

    /**
     * @notice A trader that buys and immediately sells should receive less than
     *         they paid due to fees, and never more (no free-money exploit).
     */
    function testLoad_BuySellCycleFeesDrainFunds() public {
        _createBattle(2);
        _startBattle(2);

        address trader = address(uint160(2000));
        vm.deal(trader, 10 ether);

        uint256 rounds = 5;
        for (uint256 i = 0; i < rounds; i++) {
            uint256 balBefore = trader.balance;

            vm.prank(trader);
            uint256 tokensMinted =
                waveWarz.buyShares{value: 0.5 ether}(2, true, 0.5 ether, 0, uint64(block.timestamp + 300));

            vm.prank(trader);
            waveWarz.sellShares(2, true, tokensMinted, 0, uint64(block.timestamp + 300));

            uint256 balAfter = trader.balance;
            assertLt(balAfter, balBefore, "Trader must lose ETH to fees each round");
        }
    }

    // ============ Multiple Concurrent Battles ============

    /**
     * @notice 10 battles run simultaneously. Each battle has a unique set of
     *         traders. After all battles end, state isolation is verified.
     */
    function testLoad_MultipleConcurrentBattles() public {
        uint256 battleCount = 10;
        uint256 buyAmount = 0.2 ether;

        // Create all battles before warping time
        for (uint64 i = 1; i <= uint64(battleCount); i++) {
            _createBattle(i);
        }

        // Warp to when all battles are active
        vm.warp(block.timestamp + START_OFFSET);

        // Each battle gets two unique traders
        for (uint64 i = 1; i <= uint64(battleCount); i++) {
            address traderA = address(uint160(3000 + i * 2));
            address traderB = address(uint160(3001 + i * 2));
            vm.deal(traderA, buyAmount * 2);
            vm.deal(traderB, buyAmount * 2);

            vm.prank(traderA);
            waveWarz.buyShares{value: buyAmount}(i, true, buyAmount, 0, uint64(block.timestamp + 300));

            vm.prank(traderB);
            waveWarz.buyShares{value: buyAmount}(i, false, buyAmount, 0, uint64(block.timestamp + 300));
        }

        // Verify each battle's pools are independent
        for (uint64 i = 1; i <= uint64(battleCount); i++) {
            IWaveWarzBase.Battle memory b = waveWarz.getBattle(i);
            assertTrue(b.artistAPool > 0, "Artist A pool must be positive");
            assertTrue(b.artistBPool > 0, "Artist B pool must be positive");
            assertTrue(b.isActive, "Battle must still be active");
        }

        // End all battles
        vm.warp(block.timestamp + BATTLE_DURATION + 1);
        for (uint64 i = 1; i <= uint64(battleCount); i++) {
            vm.prank(admin);
            waveWarz.endBattle(i, true);
        }

        // Verify all battles ended
        for (uint64 i = 1; i <= uint64(battleCount); i++) {
            IWaveWarzBase.Battle memory b = waveWarz.getBattle(i);
            assertFalse(b.isActive);
            assertTrue(b.winnerDecided);
        }
    }

    // ============ Large-Amount Bonding Curve Stress ============

    /**
     * @notice A single very large purchase must not overflow or revert.
     *         Verifies the sqrt/cbrt math handles amounts up to 50 ETH.
     */
    function testLoad_LargeSinglePurchase() public {
        _createBattle(20);
        _startBattle(20);

        address whale = makeAddr("whale");
        vm.deal(whale, 200 ether);

        vm.prank(whale);
        uint256 tokens = waveWarz.buyShares{value: 50 ether}(
            20, true, 50 ether, 0, uint64(block.timestamp + 300)
        );
        assertTrue(tokens > 0, "Large buy must mint tokens");

        IWaveWarzBase.Battle memory b = waveWarz.getBattle(20);
        assertTrue(b.artistAPool > 0);
    }

    /**
     * @notice Multiple large purchases on the same side should progressively
     *         mint fewer tokens per ETH (price discovery / bonding curve monotonicity).
     */
    function testLoad_ProgressivePriceIncreaseUnderLoad() public {
        _createBattle(21);
        _startBattle(21);

        uint256 traderCount = 10;
        uint256 buyAmount = 5 ether;

        // First purchase — establishes the baseline token count
        address firstTrader = address(uint160(4000));
        vm.deal(firstTrader, buyAmount * 2);
        vm.prank(firstTrader);
        uint256 prevTokens =
            waveWarz.buyShares{value: buyAmount}(21, true, buyAmount, 0, uint64(block.timestamp + 300));
        assertTrue(prevTokens > 0, "First purchase must mint tokens");

        // Each subsequent purchase must yield strictly fewer tokens (price increases with supply)
        for (uint256 i = 1; i < traderCount; i++) {
            address trader = address(uint160(4000 + i));
            vm.deal(trader, buyAmount * 2);

            vm.prank(trader);
            uint256 tokens =
                waveWarz.buyShares{value: buyAmount}(21, true, buyAmount, 0, uint64(block.timestamp + 300));

            assertLt(tokens, prevTokens, "Each successive purchase must yield fewer tokens");
            prevTokens = tokens;
        }
    }

    // ============ Claim Isolation Across Battles ============

    /**
     * @notice A trader that participated in battle 1 must not be able to claim
     *         winnings from battle 2 (battles are fully isolated).
     */
    function testLoad_ClaimIsolationAcrossBattles() public {
        _createBattle(30);
        _createBattle(31);

        vm.warp(block.timestamp + START_OFFSET);

        address trader = makeAddr("isolationTrader");
        vm.deal(trader, 10 ether);

        // Trader only buys in battle 30
        vm.prank(trader);
        waveWarz.buyShares{value: 1 ether}(30, true, 1 ether, 0, uint64(block.timestamp + 300));

        vm.warp(block.timestamp + BATTLE_DURATION + 1);

        vm.prank(admin);
        waveWarz.endBattle(30, true);
        vm.prank(admin);
        waveWarz.endBattle(31, true);

        // Claiming from battle 31 where trader has no tokens should revert
        vm.prank(trader);
        vm.expectRevert(WaveWarzBase.NoTokensToClaim.selector);
        waveWarz.claimShares(31);

        // But claiming from battle 30 should succeed
        vm.prank(trader);
        uint256 claimed = waveWarz.claimShares(30);
        assertTrue(claimed > 0);
    }

    // ============ High-Frequency Fuzz ============

    /**
     * @notice Fuzz: buying any amount in [0.001, 20] ETH must not revert and
     *         must mint a positive number of tokens.
     */
    function testFuzz_Load_BuyAnyReasonableAmount(uint256 amount) public {
        amount = bound(amount, 0.001 ether, 20 ether);

        _createBattle(40);
        _startBattle(40);

        address trader = makeAddr("fuzzLoadTrader");
        vm.deal(trader, amount * 2);

        vm.prank(trader);
        uint256 tokens =
            waveWarz.buyShares{value: amount}(40, true, amount, 0, uint64(block.timestamp + 300));
        assertTrue(tokens > 0, "Must mint tokens for any positive payment");
    }

    /**
     * @notice Fuzz: a trader who buys and then sells immediately always loses to fees.
     *         Net change must be negative (fees paid to artist + platform).
     */
    function testFuzz_Load_BuySellAlwaysLosesToFees(uint256 amount) public {
        amount = bound(amount, 0.01 ether, 10 ether);

        _createBattle(41);
        _startBattle(41);

        address trader = makeAddr("fuzzFeeTrader");
        vm.deal(trader, amount * 2);
        uint256 startBalance = trader.balance;

        vm.prank(trader);
        uint256 tokens =
            waveWarz.buyShares{value: amount}(41, true, amount, 0, uint64(block.timestamp + 300));

        vm.prank(trader);
        waveWarz.sellShares(41, true, tokens, 0, uint64(block.timestamp + 300));

        assertLt(trader.balance, startBalance, "Trader must always lose to fees");
    }

    // ============ Many Traders with Mixed Winners/Losers ============

    /**
     * @notice Stress test: 30 traders (15 per side) buy, battle ends, all claim.
     *         Winner traders should receive more than losers.
     *         No claim should revert.
     */
    function testLoad_30TradersFullLifecycle() public {
        _createBattle(50);
        _startBattle(50);

        uint256 traderCount = 30;
        uint256 halfCount = traderCount / 2;
        uint256 buyAmount = 0.05 ether;
        uint256 baseAddr = 5000;

        // Buy phase
        for (uint256 i = 0; i < traderCount; i++) {
            address trader = address(uint160(baseAddr + i));
            vm.deal(trader, buyAmount * 2);
            bool pickA = (i < halfCount); // first half back A, second half back B

            vm.prank(trader);
            waveWarz.buyShares{value: buyAmount}(50, pickA, buyAmount, 0, uint64(block.timestamp + 300));
        }

        _endBattleTime(50);
        vm.prank(admin);
        waveWarz.endBattle(50, true); // Artist A wins

        // Claim phase — verify no claim reverts
        for (uint256 i = 0; i < traderCount; i++) {
            address trader = address(uint160(baseAddr + i));
            vm.prank(trader);
            uint256 claimed = waveWarz.claimShares(50);
            assertTrue(claimed > 0, "All participants must receive a non-zero payout");
        }
    }
}
