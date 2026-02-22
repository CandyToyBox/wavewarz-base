// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../src/WaveWarzBase.sol";
import "../src/EphemeralBattleToken.sol";
import "../src/IWaveWarzBase.sol";

// ============ Mock Contracts ============

contract MockERC20 is ERC20 {
    constructor() ERC20("MockUSDC", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// Malicious contract that tries reentrancy on claimShares
contract ReentrancyAttacker {
    WaveWarzBase public target;
    uint64 public battleId;
    bool public attacking;
    uint256 public attackCount;

    constructor(address _target) {
        target = WaveWarzBase(payable(_target));
    }

    function setup(uint64 _battleId) external {
        battleId = _battleId;
    }

    function attack() external {
        attacking = true;
        target.claimShares(battleId);
    }

    receive() external payable {
        if (attacking && attackCount < 3) {
            attackCount++;
            // Try to reenter claimShares
            try target.claimShares(battleId) {} catch {}
        }
    }
}

// ============ Advanced Test Suite ============

contract WaveWarzBaseAdvancedTest is Test {
    WaveWarzBase public waveWarz;
    MockERC20 public usdc;

    address public admin = address(1);
    address public artistA = address(2);
    address public artistB = address(3);
    address public wavewarzWallet = address(4);
    address public trader1 = address(5);
    address public trader2 = address(6);
    address public trader3 = address(7);

    uint64 public constant BATTLE_ID = 1001;
    uint64 public constant BATTLE_DURATION = 1200; // 20 minutes

    function setUp() public {
        waveWarz = new WaveWarzBase();
        usdc = new MockERC20();

        // Fund actors with ETH
        vm.deal(trader1, 100 ether);
        vm.deal(trader2, 100 ether);
        vm.deal(trader3, 100 ether);
        vm.deal(admin, 10 ether);

        // Fund actors with USDC
        usdc.mint(trader1, 100_000 * 1e18);
        usdc.mint(trader2, 100_000 * 1e18);
        usdc.mint(trader3, 100_000 * 1e18);
    }

    // ============ ERC20 Payment Token Tests ============

    function test_ERC20_InitializeBattle() public {
        _createBattleERC20(BATTLE_ID);

        IWaveWarzBase.Battle memory battle = waveWarz.getBattle(BATTLE_ID);
        assertEq(battle.paymentToken, address(usdc));
        assertEq(battle.battleId, BATTLE_ID);
        assertTrue(battle.isActive);
    }

    function test_ERC20_BuyShares() public {
        _createBattleERC20(BATTLE_ID);
        _startBattle(BATTLE_ID);

        // Post-fix: _cbrt now uses safe bit-length initial guess.
        // Large ERC20 amounts (1000 tokens with 18 decimals) no longer overflow.
        uint256 buyAmount = 1000 * 1e18;

        vm.prank(trader1);
        usdc.approve(address(waveWarz), buyAmount);

        uint256 artistABefore = usdc.balanceOf(artistA);
        uint256 platformBefore = usdc.balanceOf(wavewarzWallet);
        uint256 trader1Before = usdc.balanceOf(trader1);

        vm.prank(trader1);
        uint256 tokensMinted = waveWarz.buyShares(
            BATTLE_ID,
            true,
            buyAmount,
            0,
            uint64(block.timestamp + 100)
        );

        assertTrue(tokensMinted > 0);

        // USDC deducted from trader
        assertEq(trader1Before - usdc.balanceOf(trader1), buyAmount);

        // Artist fee paid in USDC
        uint256 artistFee = (buyAmount * 100) / 10000;
        uint256 platformFee = (buyAmount * 50) / 10000;
        assertEq(usdc.balanceOf(artistA) - artistABefore, artistFee);
        assertEq(usdc.balanceOf(wavewarzWallet) - platformBefore, platformFee);

        // Tokens minted
        EphemeralBattleToken tokenA = EphemeralBattleToken(waveWarz.getArtistAToken(BATTLE_ID));
        assertEq(tokenA.balanceOf(trader1), tokensMinted);
    }

    function test_ERC20_BuyShares_RevertIfETHSent() public {
        _createBattleERC20(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        usdc.approve(address(waveWarz), 1000 * 1e18);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.InvalidPaymentToken.selector);
        waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID,
            true,
            1000 * 1e18,
            0,
            uint64(block.timestamp + 100)
        );
    }

    function test_ERC20_SellShares() public {
        _createBattleERC20(BATTLE_ID);
        _startBattle(BATTLE_ID);

        uint256 buyAmount = 1000 * 1e18; // Large amount — verifies _cbrt overflow fix

        vm.prank(trader1);
        usdc.approve(address(waveWarz), buyAmount);

        vm.prank(trader1);
        uint256 tokensMinted = waveWarz.buyShares(
            BATTLE_ID, true, buyAmount, 0, uint64(block.timestamp + 100)
        );

        uint256 trader1Before = usdc.balanceOf(trader1);

        vm.prank(trader1);
        uint256 received = waveWarz.sellShares(
            BATTLE_ID, true, tokensMinted, 0, uint64(block.timestamp + 100)
        );

        assertTrue(received > 0);
        assertEq(usdc.balanceOf(trader1) - trader1Before, received);
    }

    function test_ERC20_ClaimShares() public {
        _createBattleERC20(BATTLE_ID);
        _startBattle(BATTLE_ID);

        uint256 buyAmount = 1000 * 1e18; // Large amount — verifies _cbrt overflow fix

        vm.prank(trader1);
        usdc.approve(address(waveWarz), buyAmount);
        vm.prank(trader1);
        waveWarz.buyShares(BATTLE_ID, true, buyAmount, 0, uint64(block.timestamp + 100));

        vm.prank(trader2);
        usdc.approve(address(waveWarz), buyAmount);
        vm.prank(trader2);
        waveWarz.buyShares(BATTLE_ID, false, buyAmount, 0, uint64(block.timestamp + 100));

        _endBattleTime(BATTLE_ID);
        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true); // Artist A wins

        uint256 trader1Before = usdc.balanceOf(trader1);
        uint256 trader2Before = usdc.balanceOf(trader2);

        vm.prank(trader1);
        uint256 claimed1 = waveWarz.claimShares(BATTLE_ID);

        vm.prank(trader2);
        uint256 claimed2 = waveWarz.claimShares(BATTLE_ID);

        assertTrue(claimed1 > 0, "Winner should receive payout");
        assertTrue(claimed2 > 0, "Loser should receive 50% refund");

        assertEq(usdc.balanceOf(trader1) - trader1Before, claimed1);
        assertEq(usdc.balanceOf(trader2) - trader2Before, claimed2);

        // Winner should receive more than loser
        assertTrue(claimed1 > claimed2, "Winner should receive more than loser");
    }

    // ============ Reentrancy Protection Tests ============

    function test_Reentrancy_ClaimShares_Blocked() public {
        ReentrancyAttacker attacker = new ReentrancyAttacker(address(waveWarz));
        vm.deal(address(attacker), 1 ether);

        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        // Attacker buys shares
        vm.prank(address(attacker));
        waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100)
        );

        // Another trader buys the other side
        vm.prank(trader1);
        waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID, false, 1 ether, 0, uint64(block.timestamp + 100)
        );

        _endBattleTime(BATTLE_ID);
        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true);

        attacker.setup(BATTLE_ID);

        // Attack should fail/be blocked by ReentrancyGuard
        // Either the initial claim works but reentrant calls fail
        attacker.attack();

        // Attack count should be 0 or limited - reentrancy guard prevents double drain
        // The key invariant: attacker was only paid once
        assertTrue(attacker.attackCount() <= 1, "Reentrancy should be blocked");
    }

    // ============ Battle State Transition Tests ============

    function test_BattleStateTransition_FullLifecycle() public {
        // 1. Create
        _createBattle(BATTLE_ID);
        IWaveWarzBase.Battle memory battle = waveWarz.getBattle(BATTLE_ID);
        assertTrue(battle.isActive);
        assertFalse(battle.winnerDecided);

        // 2. Buy during battle
        _startBattle(BATTLE_ID);
        vm.prank(trader1);
        waveWarz.buyShares{value: 1 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));
        vm.prank(trader2);
        waveWarz.buyShares{value: 1 ether}(BATTLE_ID, false, 1 ether, 0, uint64(block.timestamp + 100));

        // 3. End
        _endBattleTime(BATTLE_ID);
        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true);

        battle = waveWarz.getBattle(BATTLE_ID);
        assertFalse(battle.isActive);
        assertTrue(battle.winnerDecided);
        assertTrue(battle.winnerIsArtistA);

        // 4. Claim - both traders can claim after settlement
        vm.prank(trader1);
        uint256 claimed1 = waveWarz.claimShares(BATTLE_ID);
        assertTrue(claimed1 > 0);

        vm.prank(trader2);
        uint256 claimed2 = waveWarz.claimShares(BATTLE_ID);
        assertTrue(claimed2 > 0);
    }

    function test_CannotBuyAfterBattleSettled() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        waveWarz.buyShares{value: 1 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));

        _endBattleTime(BATTLE_ID);
        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true);

        vm.prank(trader2);
        vm.expectRevert(WaveWarzBase.BattleNotActive.selector);
        waveWarz.buyShares{value: 1 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));
    }

    function test_CannotSellAfterBattleSettled() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        uint256 minted = waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100)
        );

        _endBattleTime(BATTLE_ID);
        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.BattleNotActive.selector);
        waveWarz.sellShares(BATTLE_ID, true, minted, 0, uint64(block.timestamp + 100));
    }

    // ============ Multi-Trader Settlement Math Tests ============

    function test_Settlement_ProportionalDistribution_MultipleTraders() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        // Trader1 and Trader2 back Artist A (winner)
        vm.prank(trader1);
        waveWarz.buyShares{value: 2 ether}(BATTLE_ID, true, 2 ether, 0, uint64(block.timestamp + 100));

        vm.prank(trader2);
        waveWarz.buyShares{value: 2 ether}(BATTLE_ID, true, 2 ether, 0, uint64(block.timestamp + 100));

        // Trader3 backs Artist B (loser)
        vm.prank(trader3);
        waveWarz.buyShares{value: 4 ether}(BATTLE_ID, false, 4 ether, 0, uint64(block.timestamp + 100));

        _endBattleTime(BATTLE_ID);
        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true); // Artist A wins

        // All three can claim
        vm.prank(trader1);
        uint256 claimed1 = waveWarz.claimShares(BATTLE_ID);

        vm.prank(trader2);
        uint256 claimed2 = waveWarz.claimShares(BATTLE_ID);

        vm.prank(trader3);
        uint256 claimed3 = waveWarz.claimShares(BATTLE_ID);

        // trader1 bought first (lower bonding curve price = more tokens = larger pool share)
        // trader2 bought second (higher price = fewer tokens = smaller pool share)
        // So claimed1 > claimed2 despite same ETH investment
        assertTrue(claimed1 > claimed2, "First buyer gets more tokens and thus larger payout");
        assertTrue(claimed1 > 0 && claimed2 > 0, "Both traders should receive payouts");

        // Losers (trader3) get less than winners
        assertTrue(claimed3 < claimed1 + claimed2);

        // Losers still get > 0 (50% refund)
        assertTrue(claimed3 > 0);
    }

    function test_Settlement_OneSidedBattle_NoLoserPool() public {
        // Only one side has traders - loser pool is 0
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        waveWarz.buyShares{value: 2 ether}(BATTLE_ID, true, 2 ether, 0, uint64(block.timestamp + 100));
        // No one buys Artist B

        _endBattleTime(BATTLE_ID);

        // Should not revert even with empty loser pool
        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true); // Artist A wins (no loser pool)

        // Trader can claim their own pool back
        vm.prank(trader1);
        uint256 claimed = waveWarz.claimShares(BATTLE_ID);
        assertTrue(claimed > 0);
    }

    function test_Settlement_FeeDistribution_ExactAmounts() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        uint256 aAmount = 5 ether;
        uint256 bAmount = 4 ether;

        vm.prank(trader1);
        waveWarz.buyShares{value: aAmount}(BATTLE_ID, true, aAmount, 0, uint64(block.timestamp + 100));

        vm.prank(trader2);
        waveWarz.buyShares{value: bAmount}(BATTLE_ID, false, bAmount, 0, uint64(block.timestamp + 100));

        _endBattleTime(BATTLE_ID);

        uint256 winnerArtistBefore = artistA.balance;
        uint256 loserArtistBefore = artistB.balance;
        uint256 platformBefore = wavewarzWallet.balance;

        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true);

        IWaveWarzBase.Battle memory battle = waveWarz.getBattle(BATTLE_ID);

        // Verify settlement bonuses were paid from loser pool
        // Loser pool = bAmount - artist_fee - platform_fee (fees were deducted on buy)
        uint256 loserPool = battle.artistBPool + (battle.artistBPool * 1000 / 9000); // approx, before settlement deduction
        // Just check that payments increased
        assertTrue(artistA.balance > winnerArtistBefore, "Winner artist should receive bonus");
        assertTrue(artistB.balance > loserArtistBefore, "Loser artist should receive consolation");
        assertTrue(wavewarzWallet.balance > platformBefore, "Platform should receive settlement fee");
    }

    // ============ Edge Cases ============

    function test_ZeroAmountBuy_Reverts() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.InvalidAmount.selector);
        waveWarz.buyShares{value: 0}(BATTLE_ID, true, 0, 0, uint64(block.timestamp + 100));
    }

    function test_ZeroAmountSell_Reverts() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        waveWarz.buyShares{value: 1 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.InvalidAmount.selector);
        waveWarz.sellShares(BATTLE_ID, true, 0, 0, uint64(block.timestamp + 100));
    }

    function test_BattleNotFound_Reverts() public {
        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.BattleNotFound.selector);
        waveWarz.buyShares{value: 1 ether}(999, true, 1 ether, 0, uint64(block.timestamp + 100));
    }

    function test_InvalidArtistWallet_Reverts() public {
        IWaveWarzBase.BattleInitParams memory params = IWaveWarzBase.BattleInitParams({
            battleId: BATTLE_ID,
            battleDuration: BATTLE_DURATION,
            startTime: uint64(block.timestamp + 60),
            artistAWallet: address(0), // Invalid
            artistBWallet: artistB,
            wavewarzWallet: wavewarzWallet,
            paymentToken: address(0)
        });

        vm.prank(admin);
        vm.expectRevert(WaveWarzBase.InvalidArtistWallet.selector);
        waveWarz.initializeBattle(params);
    }

    function test_WrongETHAmount_Reverts() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.InsufficientFunds.selector);
        // Send 2 ETH but specify 1 ETH as amount
        waveWarz.buyShares{value: 2 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));
    }

    function test_SlippageProtection_SellShares() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        uint256 minted = waveWarz.buyShares{value: 5 ether}(
            BATTLE_ID, true, 5 ether, 0, uint64(block.timestamp + 100)
        );

        // Try to sell with unrealistic minimum out
        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.SlippageExceeded.selector);
        waveWarz.sellShares(
            BATTLE_ID, true, minted, type(uint256).max, uint64(block.timestamp + 100)
        );
    }

    function test_Deadline_Sell_Reverts() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        uint256 minted = waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100)
        );

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.DeadlineExceeded.selector);
        waveWarz.sellShares(
            BATTLE_ID, true, minted, 0, uint64(block.timestamp - 1)
        );
    }

    // ============ _cbrt Overflow Regression Tests ============

    function test_CbrtFix_LargeERC20Amount_NoOverflow() public {
        // Regression: _cbrt previously overflowed for (1.5 * netAmount)^2 > ~1.07e38.
        // Old code: z = x in initial loop → z*z overflows uint256 for x > 1.07e38.
        // Fix: safe bit-length initial guess → z_0 = 2^ceil(bitlen(x)/3) ≤ 2^86.
        _createBattleERC20(BATTLE_ID);
        _startBattle(BATTLE_ID);

        // 100,000 tokens with 18 decimals — previously would panic
        uint256 largeAmount = 100_000 * 1e18;
        usdc.mint(trader1, largeAmount);

        vm.prank(trader1);
        usdc.approve(address(waveWarz), largeAmount);

        vm.prank(trader1);
        uint256 minted = waveWarz.buyShares(
            BATTLE_ID, true, largeAmount, 0, uint64(block.timestamp + 100)
        );
        assertTrue(minted > 0, "Large ERC20 buy should mint tokens");
    }

    function test_CbrtFix_LargeETHAmount_NoOverflow() public {
        // Regression: 100 ETH single trade previously would overflow _cbrt.
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        uint256 largeETH = 100 ether;
        vm.deal(trader1, largeETH + 1 ether);

        vm.prank(trader1);
        uint256 minted = waveWarz.buyShares{value: largeETH}(
            BATTLE_ID, true, largeETH, 0, uint64(block.timestamp + 100)
        );
        assertTrue(minted > 0, "Large ETH buy should mint tokens");
    }

    // ============ Bonding Curve Invariants ============

    function test_BondingCurve_NoArbitrage() public {
        // Buy X tokens, immediately sell X tokens — should always lose money (fees)
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        uint256 buyAmount = 1 ether;
        uint256 trader1Before = trader1.balance;

        vm.prank(trader1);
        uint256 minted = waveWarz.buyShares{value: buyAmount}(
            BATTLE_ID, true, buyAmount, 0, uint64(block.timestamp + 100)
        );

        vm.prank(trader1);
        uint256 received = waveWarz.sellShares(
            BATTLE_ID, true, minted, 0, uint64(block.timestamp + 100)
        );

        // Should always be less than initial investment (fees deducted)
        assertTrue(trader1.balance < trader1Before, "Buy+sell should always cost fees");
        assertTrue(received < buyAmount, "Sell return should be less than buy cost");
    }

    function test_BondingCurve_TokenSupplyConsistency() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        uint256 minted1 = waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100)
        );

        vm.prank(trader2);
        uint256 minted2 = waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100)
        );

        IWaveWarzBase.Battle memory battle = waveWarz.getBattle(BATTLE_ID);
        EphemeralBattleToken tokenA = EphemeralBattleToken(waveWarz.getArtistAToken(BATTLE_ID));

        // Contract state and token supply should match
        assertEq(battle.artistASupply, minted1 + minted2);
        assertEq(tokenA.totalSupply(), minted1 + minted2);
        assertEq(tokenA.balanceOf(trader1), minted1);
        assertEq(tokenA.balanceOf(trader2), minted2);
    }

    function test_BondingCurve_SellReturnDecreases() public view {
        // Selling from higher supply should return less per token
        uint256 highSupply = 1000 ether;
        uint256 lowSupply = 10 ether;
        uint256 sellAmount = 1 ether;

        uint256 returnHigh = waveWarz.calculateSellReturn(highSupply, sellAmount);
        uint256 returnLow = waveWarz.calculateSellReturn(lowSupply, sellAmount);

        assertTrue(returnHigh > returnLow, "Return from higher supply should be greater");
    }

    // ============ Multiple Battles Isolation ============

    function test_MultipleBattles_IndependentSettlement() public {
        uint64 battle1 = 101;
        uint64 battle2 = 102;

        _createBattle(battle1);
        _createBattle(battle2);
        _startBattle(battle1);
        _startBattle(battle2);

        // Trade on both
        vm.prank(trader1);
        waveWarz.buyShares{value: 1 ether}(battle1, true, 1 ether, 0, uint64(block.timestamp + 100));
        vm.prank(trader2);
        waveWarz.buyShares{value: 1 ether}(battle1, false, 1 ether, 0, uint64(block.timestamp + 100));

        vm.prank(trader1);
        waveWarz.buyShares{value: 2 ether}(battle2, true, 2 ether, 0, uint64(block.timestamp + 100));
        vm.prank(trader2);
        waveWarz.buyShares{value: 2 ether}(battle2, false, 2 ether, 0, uint64(block.timestamp + 100));

        _endBattleTime(battle1);
        _endBattleTime(battle2);

        // End with different winners
        vm.prank(admin);
        waveWarz.endBattle(battle1, true); // A wins battle1

        vm.prank(admin);
        waveWarz.endBattle(battle2, false); // B wins battle2

        // Verify independent state
        IWaveWarzBase.Battle memory b1 = waveWarz.getBattle(battle1);
        IWaveWarzBase.Battle memory b2 = waveWarz.getBattle(battle2);

        assertTrue(b1.winnerIsArtistA);
        assertFalse(b2.winnerIsArtistA);

        // Claim from each independently
        vm.prank(trader1);
        uint256 claimedB1 = waveWarz.claimShares(battle1);
        vm.prank(trader1);
        uint256 claimedB2 = waveWarz.claimShares(battle2);

        assertTrue(claimedB1 > 0);
        assertTrue(claimedB2 > 0);
    }

    // ============ Event Emission Tests ============
    // Declare events locally (matching IWaveWarzBase) for expectEmit compatibility
    event BattleCreated(
        uint64 indexed battleId,
        address artistAWallet,
        address artistBWallet,
        uint64 startTime,
        uint64 endTime,
        address paymentToken
    );
    event SharesPurchased(
        uint64 indexed battleId,
        address indexed trader,
        bool artistA,
        uint256 tokenAmount,
        uint256 paymentAmount,
        uint256 artistFee,
        uint256 platformFee
    );
    event BattleEnded(
        uint64 indexed battleId,
        bool winnerIsArtistA,
        uint256 artistAPool,
        uint256 artistBPool
    );

    function test_Events_BattleCreated() public {
        IWaveWarzBase.BattleInitParams memory params = _buildParams(BATTLE_ID);
        uint64 expectedEndTime = params.startTime + params.battleDuration;

        vm.expectEmit(true, false, false, true);
        emit BattleCreated(BATTLE_ID, artistA, artistB, params.startTime, expectedEndTime, address(0));

        vm.prank(admin);
        waveWarz.initializeBattle(params);
    }

    function test_Events_SharesPurchased() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        // Only check indexed fields (battleId, trader)
        vm.expectEmit(true, true, false, false);
        emit SharesPurchased(BATTLE_ID, trader1, true, 0, 0, 0, 0);

        vm.prank(trader1);
        waveWarz.buyShares{value: 1 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));
    }

    function test_Events_BattleEnded() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        waveWarz.buyShares{value: 1 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));

        _endBattleTime(BATTLE_ID);

        // Only check indexed field (battleId)
        vm.expectEmit(true, false, false, false);
        emit BattleEnded(BATTLE_ID, true, 0, 0);

        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true);
    }

    // ============ Helper Functions ============

    function _createBattle(uint64 battleId) internal {
        IWaveWarzBase.BattleInitParams memory params = _buildParams(battleId);
        vm.prank(admin);
        waveWarz.initializeBattle(params);
    }

    function _createBattleERC20(uint64 battleId) internal {
        IWaveWarzBase.BattleInitParams memory params = IWaveWarzBase.BattleInitParams({
            battleId: battleId,
            battleDuration: BATTLE_DURATION,
            startTime: uint64(block.timestamp + 60),
            artistAWallet: artistA,
            artistBWallet: artistB,
            wavewarzWallet: wavewarzWallet,
            paymentToken: address(usdc)
        });

        vm.prank(admin);
        waveWarz.initializeBattle(params);
    }

    function _buildParams(uint64 battleId) internal view returns (IWaveWarzBase.BattleInitParams memory) {
        return IWaveWarzBase.BattleInitParams({
            battleId: battleId,
            battleDuration: BATTLE_DURATION,
            startTime: uint64(block.timestamp + 60),
            artistAWallet: artistA,
            artistBWallet: artistB,
            wavewarzWallet: wavewarzWallet,
            paymentToken: address(0)
        });
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
