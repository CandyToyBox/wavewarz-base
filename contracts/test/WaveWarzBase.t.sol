// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/WaveWarzBase.sol";
import "../src/EphemeralBattleToken.sol";
import "../src/IWaveWarzBase.sol";

contract WaveWarzBaseTest is Test {
    WaveWarzBase public waveWarz;

    address public admin = address(1);
    address public artistA = address(2);
    address public artistB = address(3);
    address public wavewarzWallet = address(4);
    address public trader1 = address(5);
    address public trader2 = address(6);
    address public trader3 = address(7);

    uint64 public constant BATTLE_ID = 1;
    uint64 public constant BATTLE_DURATION = 1200; // 20 minutes

    function setUp() public {
        waveWarz = new WaveWarzBase();

        // Fund traders
        vm.deal(trader1, 100 ether);
        vm.deal(trader2, 100 ether);
        vm.deal(trader3, 100 ether);
        vm.deal(admin, 10 ether);
    }

    // ============ Initialization Tests ============

    function testInitializeBattle() public {
        _createBattle(BATTLE_ID);

        IWaveWarzBase.Battle memory battle = waveWarz.getBattle(BATTLE_ID);

        assertEq(battle.battleId, BATTLE_ID);
        assertEq(battle.artistAWallet, artistA);
        assertEq(battle.artistBWallet, artistB);
        assertEq(battle.wavewarzWallet, wavewarzWallet);
        assertTrue(battle.isActive);
        assertFalse(battle.winnerDecided);
        assertEq(battle.artistAPool, 0);
        assertEq(battle.artistBPool, 0);
    }

    function testInitializeBattleCreatesTokens() public {
        _createBattle(BATTLE_ID);

        address tokenA = waveWarz.getArtistAToken(BATTLE_ID);
        address tokenB = waveWarz.getArtistBToken(BATTLE_ID);

        assertTrue(tokenA != address(0));
        assertTrue(tokenB != address(0));
        assertTrue(tokenA != tokenB);
    }

    function testCannotInitializeDuplicateBattle() public {
        _createBattle(BATTLE_ID);

        vm.expectRevert(WaveWarzBase.BattleAlreadyExists.selector);
        _createBattle(BATTLE_ID);
    }

    function testCannotInitializeWithZeroDuration() public {
        IWaveWarzBase.BattleInitParams memory params = IWaveWarzBase.BattleInitParams({
            battleId: BATTLE_ID,
            battleDuration: 0,
            startTime: uint64(block.timestamp + 60),
            artistAWallet: artistA,
            artistBWallet: artistB,
            wavewarzWallet: wavewarzWallet,
            paymentToken: address(0)
        });

        vm.prank(admin);
        vm.expectRevert(WaveWarzBase.InvalidDuration.selector);
        waveWarz.initializeBattle(params);
    }

    function testCannotInitializeWithPastStartTime() public {
        IWaveWarzBase.BattleInitParams memory params = IWaveWarzBase.BattleInitParams({
            battleId: BATTLE_ID,
            battleDuration: BATTLE_DURATION,
            startTime: uint64(block.timestamp - 1),
            artistAWallet: artistA,
            artistBWallet: artistB,
            wavewarzWallet: wavewarzWallet,
            paymentToken: address(0)
        });

        vm.prank(admin);
        vm.expectRevert(WaveWarzBase.InvalidStartTime.selector);
        waveWarz.initializeBattle(params);
    }

    // ============ Buy Shares Tests ============

    function testBuySharesArtistA() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        uint256 buyAmount = 1 ether;
        uint256 artistBalanceBefore = artistA.balance;
        uint256 platformBalanceBefore = wavewarzWallet.balance;

        vm.prank(trader1);
        uint256 tokensMinted = waveWarz.buyShares{value: buyAmount}(
            BATTLE_ID,
            true, // Artist A
            buyAmount,
            0, // No slippage protection for test
            uint64(block.timestamp + 100)
        );

        assertTrue(tokensMinted > 0);

        // Check token balance
        EphemeralBattleToken tokenA = EphemeralBattleToken(waveWarz.getArtistAToken(BATTLE_ID));
        assertEq(tokenA.balanceOf(trader1), tokensMinted);

        // Check fees paid
        uint256 artistFee = (buyAmount * 100) / 10000; // 1%
        uint256 platformFee = (buyAmount * 50) / 10000; // 0.5%

        assertEq(artistA.balance - artistBalanceBefore, artistFee);
        assertEq(wavewarzWallet.balance - platformBalanceBefore, platformFee);

        // Check pool increased
        IWaveWarzBase.Battle memory battle = waveWarz.getBattle(BATTLE_ID);
        assertEq(battle.artistAPool, buyAmount - artistFee - platformFee);
    }

    function testBuySharesArtistB() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        uint256 buyAmount = 1 ether;

        vm.prank(trader1);
        uint256 tokensMinted = waveWarz.buyShares{value: buyAmount}(
            BATTLE_ID,
            false, // Artist B
            buyAmount,
            0,
            uint64(block.timestamp + 100)
        );

        assertTrue(tokensMinted > 0);

        EphemeralBattleToken tokenB = EphemeralBattleToken(waveWarz.getArtistBToken(BATTLE_ID));
        assertEq(tokenB.balanceOf(trader1), tokensMinted);
    }

    function testCannotBuyBeforeBattleStarts() public {
        _createBattle(BATTLE_ID);
        // Don't start the battle

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.BattleNotActive.selector);
        waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID,
            true,
            1 ether,
            0,
            uint64(block.timestamp + 100)
        );
    }

    function testCannotBuyAfterBattleEnds() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);
        _endBattleTime(BATTLE_ID);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.BattleNotActive.selector);
        waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID,
            true,
            1 ether,
            0,
            uint64(block.timestamp + 100)
        );
    }

    function testCannotBuyWithExpiredDeadline() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.DeadlineExceeded.selector);
        waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID,
            true,
            1 ether,
            0,
            uint64(block.timestamp - 1) // Expired deadline
        );
    }

    function testSlippageProtectionOnBuy() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        // First trader buys to increase price
        vm.prank(trader1);
        waveWarz.buyShares{value: 10 ether}(BATTLE_ID, true, 10 ether, 0, uint64(block.timestamp + 100));

        // Second trader tries with high min tokens expectation
        vm.prank(trader2);
        vm.expectRevert(WaveWarzBase.SlippageExceeded.selector);
        waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID,
            true,
            1 ether,
            type(uint256).max, // Unrealistic minimum
            uint64(block.timestamp + 100)
        );
    }

    // ============ Sell Shares Tests ============

    function testSellShares() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        // Buy first
        vm.prank(trader1);
        uint256 tokensMinted = waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID,
            true,
            1 ether,
            0,
            uint64(block.timestamp + 100)
        );

        uint256 traderBalanceBefore = trader1.balance;
        uint256 artistBalanceBefore = artistA.balance;

        // Sell all tokens
        vm.prank(trader1);
        uint256 amountReceived = waveWarz.sellShares(
            BATTLE_ID,
            true,
            tokensMinted,
            0,
            uint64(block.timestamp + 100)
        );

        assertTrue(amountReceived > 0);
        assertTrue(trader1.balance > traderBalanceBefore);
        assertTrue(artistA.balance > artistBalanceBefore); // Artist fee on sell

        // Token balance should be 0
        EphemeralBattleToken tokenA = EphemeralBattleToken(waveWarz.getArtistAToken(BATTLE_ID));
        assertEq(tokenA.balanceOf(trader1), 0);
    }

    function testCannotSellMoreThanOwned() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        uint256 tokensMinted = waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID,
            true,
            1 ether,
            0,
            uint64(block.timestamp + 100)
        );

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.InsufficientFunds.selector);
        waveWarz.sellShares(
            BATTLE_ID,
            true,
            tokensMinted + 1, // More than owned
            0,
            uint64(block.timestamp + 100)
        );
    }

    // ============ End Battle Tests ============

    function testEndBattleArtistAWins() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        // Both sides get trades
        vm.prank(trader1);
        waveWarz.buyShares{value: 5 ether}(BATTLE_ID, true, 5 ether, 0, uint64(block.timestamp + 100));

        vm.prank(trader2);
        waveWarz.buyShares{value: 3 ether}(BATTLE_ID, false, 3 ether, 0, uint64(block.timestamp + 100));

        _endBattleTime(BATTLE_ID);

        uint256 winnerArtistBalanceBefore = artistA.balance;
        uint256 loserArtistBalanceBefore = artistB.balance;
        uint256 platformBalanceBefore = wavewarzWallet.balance;

        // End battle - Artist A wins
        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true);

        IWaveWarzBase.Battle memory battle = waveWarz.getBattle(BATTLE_ID);
        assertFalse(battle.isActive);
        assertTrue(battle.winnerDecided);
        assertTrue(battle.winnerIsArtistA);

        // Verify settlement bonuses paid from loser's pool (Artist B)
        assertTrue(artistA.balance > winnerArtistBalanceBefore); // Winner bonus
        assertTrue(artistB.balance > loserArtistBalanceBefore); // Loser bonus
        assertTrue(wavewarzWallet.balance > platformBalanceBefore); // Platform bonus
    }

    function testEndBattleArtistBWins() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        waveWarz.buyShares{value: 2 ether}(BATTLE_ID, true, 2 ether, 0, uint64(block.timestamp + 100));

        vm.prank(trader2);
        waveWarz.buyShares{value: 4 ether}(BATTLE_ID, false, 4 ether, 0, uint64(block.timestamp + 100));

        _endBattleTime(BATTLE_ID);

        // End battle - Artist B wins
        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, false);

        IWaveWarzBase.Battle memory battle = waveWarz.getBattle(BATTLE_ID);
        assertFalse(battle.winnerIsArtistA);
    }

    function testCannotEndBattleBeforeTime() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(admin);
        vm.expectRevert(WaveWarzBase.BattleStillActive.selector);
        waveWarz.endBattle(BATTLE_ID, true);
    }

    function testCannotEndBattleTwice() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);
        _endBattleTime(BATTLE_ID);

        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true);

        vm.prank(admin);
        vm.expectRevert(WaveWarzBase.BattleAlreadyEnded.selector);
        waveWarz.endBattle(BATTLE_ID, false);
    }

    function testOnlyAdminCanEndBattle() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);
        _endBattleTime(BATTLE_ID);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.NotBattleAdmin.selector);
        waveWarz.endBattle(BATTLE_ID, true);
    }

    // ============ Claim Shares Tests ============

    function testClaimSharesWinner() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        // Trader1 backs Artist A (winner)
        vm.prank(trader1);
        waveWarz.buyShares{value: 2 ether}(BATTLE_ID, true, 2 ether, 0, uint64(block.timestamp + 100));

        // Trader2 backs Artist B (loser)
        vm.prank(trader2);
        waveWarz.buyShares{value: 2 ether}(BATTLE_ID, false, 2 ether, 0, uint64(block.timestamp + 100));

        _endBattleTime(BATTLE_ID);

        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true); // Artist A wins

        uint256 trader1BalanceBefore = trader1.balance;

        vm.prank(trader1);
        uint256 claimed = waveWarz.claimShares(BATTLE_ID);

        assertTrue(claimed > 0);
        assertEq(trader1.balance - trader1BalanceBefore, claimed);
    }

    function testClaimSharesLoser() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        waveWarz.buyShares{value: 2 ether}(BATTLE_ID, true, 2 ether, 0, uint64(block.timestamp + 100));

        vm.prank(trader2);
        waveWarz.buyShares{value: 2 ether}(BATTLE_ID, false, 2 ether, 0, uint64(block.timestamp + 100));

        _endBattleTime(BATTLE_ID);

        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true); // Artist A wins, trader2 loses

        uint256 trader2BalanceBefore = trader2.balance;

        vm.prank(trader2);
        uint256 claimed = waveWarz.claimShares(BATTLE_ID);

        // Loser still gets 50% back
        assertTrue(claimed > 0);
        assertEq(trader2.balance - trader2BalanceBefore, claimed);
    }

    function testCannotClaimBeforeWinnerDecided() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        waveWarz.buyShares{value: 1 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.WinnerNotDecided.selector);
        waveWarz.claimShares(BATTLE_ID);
    }

    function testCannotClaimTwice() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        waveWarz.buyShares{value: 1 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));

        _endBattleTime(BATTLE_ID);
        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true);

        vm.prank(trader1);
        waveWarz.claimShares(BATTLE_ID);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.AlreadyClaimed.selector);
        waveWarz.claimShares(BATTLE_ID);
    }

    function testCannotClaimWithNoTokens() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        waveWarz.buyShares{value: 1 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));

        _endBattleTime(BATTLE_ID);
        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true);

        // trader2 never bought any shares
        vm.prank(trader2);
        vm.expectRevert(WaveWarzBase.NoTokensToClaim.selector);
        waveWarz.claimShares(BATTLE_ID);
    }

    // ============ Fee Verification Tests ============

    function testFeeConstantsAreCorrect() public {
        assertEq(waveWarz.ARTIST_FEE_BPS(), 100);
        assertEq(waveWarz.PLATFORM_FEE_BPS(), 50);
        assertEq(waveWarz.WINNER_TRADER_BPS(), 4000);
        assertEq(waveWarz.LOSER_TRADER_BPS(), 5000);
        assertEq(waveWarz.WINNER_ARTIST_BPS(), 500);
        assertEq(waveWarz.LOSER_ARTIST_BPS(), 200);
        assertEq(waveWarz.PLATFORM_SETTLE_BPS(), 300);

        // Verify settlement adds to 100%
        uint256 total = waveWarz.WINNER_TRADER_BPS() +
            waveWarz.LOSER_TRADER_BPS() +
            waveWarz.WINNER_ARTIST_BPS() +
            waveWarz.LOSER_ARTIST_BPS() +
            waveWarz.PLATFORM_SETTLE_BPS();
        assertEq(total, 10000);
    }

    // ============ Bonding Curve Tests ============

    function testBondingCurvePriceIncreases() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        // First buy
        vm.prank(trader1);
        uint256 tokens1 = waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID,
            true,
            1 ether,
            0,
            uint64(block.timestamp + 100)
        );

        // Second buy of same ETH amount should yield fewer tokens
        vm.prank(trader2);
        uint256 tokens2 = waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID,
            true,
            1 ether,
            0,
            uint64(block.timestamp + 100)
        );

        assertTrue(tokens1 > tokens2, "Price should increase with supply");
    }

    function testCalculateBuyPriceZeroTokens() public {
        uint256 price = waveWarz.calculateBuyPrice(1000, 0);
        assertEq(price, 0);
    }

    function testCalculateSellReturnZeroTokens() public {
        uint256 ret = waveWarz.calculateSellReturn(1000, 0);
        assertEq(ret, 0);
    }

    // ============ Multiple Battles Tests ============

    function testMultipleConcurrentBattles() public {
        _createBattle(1);
        _createBattle(2);
        _createBattle(3);

        _startBattle(1);
        _startBattle(2);
        _startBattle(3);

        // Trade on all battles
        vm.prank(trader1);
        waveWarz.buyShares{value: 1 ether}(1, true, 1 ether, 0, uint64(block.timestamp + 100));

        vm.prank(trader1);
        waveWarz.buyShares{value: 1 ether}(2, false, 1 ether, 0, uint64(block.timestamp + 100));

        vm.prank(trader1);
        waveWarz.buyShares{value: 1 ether}(3, true, 1 ether, 0, uint64(block.timestamp + 100));

        // Verify independent state
        IWaveWarzBase.Battle memory battle1 = waveWarz.getBattle(1);
        IWaveWarzBase.Battle memory battle2 = waveWarz.getBattle(2);
        IWaveWarzBase.Battle memory battle3 = waveWarz.getBattle(3);

        assertTrue(battle1.artistAPool > 0);
        assertEq(battle1.artistBPool, 0);

        assertEq(battle2.artistAPool, 0);
        assertTrue(battle2.artistBPool > 0);

        assertTrue(battle3.artistAPool > 0);
        assertEq(battle3.artistBPool, 0);
    }

    // ============ Helper Functions ============

    function _createBattle(uint64 battleId) internal {
        IWaveWarzBase.BattleInitParams memory params = IWaveWarzBase.BattleInitParams({
            battleId: battleId,
            battleDuration: BATTLE_DURATION,
            startTime: uint64(block.timestamp + 60), // Starts in 60 seconds
            artistAWallet: artistA,
            artistBWallet: artistB,
            wavewarzWallet: wavewarzWallet,
            paymentToken: address(0) // ETH
        });

        vm.prank(admin);
        waveWarz.initializeBattle(params);
    }

    function _startBattle(uint64 battleId) internal {
        IWaveWarzBase.Battle memory battle = waveWarz.getBattle(battleId);
        vm.warp(battle.startTime);
    }

    function _endBattleTime(uint64 battleId) internal {
        IWaveWarzBase.Battle memory battle = waveWarz.getBattle(battleId);
        vm.warp(battle.endTime + 1);
    }
}
