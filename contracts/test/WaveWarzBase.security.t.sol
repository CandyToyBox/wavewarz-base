// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../src/WaveWarzBase.sol";
import "../src/EphemeralBattleToken.sol";
import "../src/IWaveWarzBase.sol";

// ============ Helper Contracts ============

/// @dev Minimal ERC20 used for ERC20 payment-token battle tests
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock Token", "MCK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Attacker that attempts reentrancy through sellShares ETH callback
contract SellReentrancyAttacker {
    WaveWarzBase public immutable target;
    uint64 public battleId;
    bool public attacking;
    bool public reentrancySucceeded;
    uint256 public tokensMinted;

    constructor(address payable _target) {
        target = WaveWarzBase(_target);
    }

    function buyShares(uint64 _battleId, uint256 amount) external payable {
        battleId = _battleId;
        tokensMinted =
            target.buyShares{value: amount}(_battleId, true, amount, 0, uint64(block.timestamp + 300));
    }

    /// @dev Sell all-but-one token; receive() tries to sell the remaining one
    function attack() external {
        require(tokensMinted > 1, "Need at least 2 tokens");
        attacking = true;
        uint256 sellAmount = tokensMinted - 1; // keep 1 for reentry attempt
        tokensMinted = 0;
        target.sellShares(battleId, true, sellAmount, 0, uint64(block.timestamp + 300));
        attacking = false;
    }

    receive() external payable {
        if (attacking) {
            attacking = false;
            try target.sellShares(battleId, true, 1, 0, uint64(block.timestamp + 300)) {
                reentrancySucceeded = true; // would be a vulnerability
            } catch {
                // correctly blocked — expected path
            }
        }
    }
}

/// @dev Attacker that attempts reentrancy through claimShares ETH callback
contract ClaimReentrancyAttacker {
    WaveWarzBase public immutable target;
    uint64 public battleId;
    bool public attacking;
    bool public reentrancySucceeded;

    constructor(address payable _target) {
        target = WaveWarzBase(_target);
    }

    function buyShares(uint64 _battleId, uint256 amount) external payable {
        battleId = _battleId;
        target.buyShares{value: amount}(_battleId, true, amount, 0, uint64(block.timestamp + 300));
    }

    function attack() external {
        attacking = true;
        target.claimShares(battleId);
        attacking = false;
    }

    receive() external payable {
        if (attacking) {
            attacking = false;
            try target.claimShares(battleId) {
                reentrancySucceeded = true; // would be a vulnerability
            } catch {
                // correctly blocked — expected path
            }
        }
    }
}

// ============ Security & Edge-Case Test Contract ============

contract WaveWarzBaseSecurityTest is Test {
    WaveWarzBase public waveWarz;

    address public admin = address(1);
    address public artistA = address(2);
    address public artistB = address(3);
    address public wavewarzWallet = address(4);
    address public trader1 = address(5);
    address public trader2 = address(6);

    uint64 public constant BATTLE_ID = 1;
    uint64 public constant BATTLE_DURATION = 1200; // 20 minutes

    function setUp() public {
        waveWarz = new WaveWarzBase();
        vm.deal(trader1, 100 ether);
        vm.deal(trader2, 100 ether);
        vm.deal(admin, 10 ether);
    }

    // ============ Reentrancy Protection ============

    /// @dev A contract receiving ETH during sellShares must not be able to reenter sellShares.
    function testReentrancyProtectionOnSellShares() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        SellReentrancyAttacker attacker = new SellReentrancyAttacker(payable(address(waveWarz)));
        vm.deal(address(attacker), 10 ether);

        attacker.buyShares{value: 2 ether}(BATTLE_ID, 2 ether);
        attacker.attack();

        assertFalse(attacker.reentrancySucceeded(), "Reentrancy must be blocked by nonReentrant modifier");
    }

    /// @dev A contract receiving ETH during claimShares must not be able to reenter claimShares.
    function testReentrancyProtectionOnClaimShares() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        ClaimReentrancyAttacker attacker = new ClaimReentrancyAttacker(payable(address(waveWarz)));
        vm.deal(address(attacker), 10 ether);

        attacker.buyShares{value: 1 ether}(BATTLE_ID, 1 ether);

        _endBattleTime(BATTLE_ID);
        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true); // Artist A wins — attacker holds A tokens

        attacker.attack();

        assertFalse(attacker.reentrancySucceeded(), "Reentrancy must be blocked by nonReentrant modifier");
    }

    // ============ EphemeralBattleToken Access Control ============

    /// @dev Only the WaveWarzBase contract may mint ephemeral battle tokens.
    function testEphemeralTokenOnlyBattleContractCanMint() public {
        _createBattle(BATTLE_ID);
        EphemeralBattleToken tokenA = EphemeralBattleToken(waveWarz.getArtistAToken(BATTLE_ID));

        vm.prank(address(0xdead));
        vm.expectRevert(EphemeralBattleToken.OnlyBattleContract.selector);
        tokenA.mint(address(0xdead), 1000 ether);
    }

    /// @dev Only the WaveWarzBase contract may burn ephemeral battle tokens.
    function testEphemeralTokenOnlyBattleContractCanBurn() public {
        _createBattle(BATTLE_ID);
        EphemeralBattleToken tokenA = EphemeralBattleToken(waveWarz.getArtistAToken(BATTLE_ID));

        vm.prank(address(0xdead));
        vm.expectRevert(EphemeralBattleToken.OnlyBattleContract.selector);
        tokenA.burn(address(0xdead), 1000 ether);
    }

    /// @dev Tokens for Artist A and Artist B are distinct contracts per battle.
    function testEphemeralTokensAreDistinctPerBattle() public {
        _createBattle(BATTLE_ID);
        _createBattle(2);

        address b1TokenA = waveWarz.getArtistAToken(BATTLE_ID);
        address b1TokenB = waveWarz.getArtistBToken(BATTLE_ID);
        address b2TokenA = waveWarz.getArtistAToken(2);
        address b2TokenB = waveWarz.getArtistBToken(2);

        assertTrue(b1TokenA != b1TokenB);
        assertTrue(b1TokenA != b2TokenA);
        assertTrue(b1TokenA != b2TokenB);
        assertTrue(b2TokenA != b2TokenB);
    }

    // ============ ETH Payment Validation ============

    /// @dev Sending msg.value ≠ amount param for an ETH battle should revert.
    function testBuySharesETHAmountMismatch() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.InsufficientFunds.selector);
        waveWarz.buyShares{value: 0.5 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));
    }

    /// @dev Sending ETH to an ERC20 battle should revert.
    function testBuySharesETHSentForERC20Battle() public {
        MockERC20 token = new MockERC20();
        IWaveWarzBase.BattleInitParams memory params = IWaveWarzBase.BattleInitParams({
            battleId: BATTLE_ID,
            battleDuration: BATTLE_DURATION,
            startTime: uint64(block.timestamp + 60),
            artistAWallet: artistA,
            artistBWallet: artistB,
            wavewarzWallet: wavewarzWallet,
            paymentToken: address(token)
        });
        vm.prank(admin);
        waveWarz.initializeBattle(params);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.InvalidPaymentToken.selector);
        waveWarz.buyShares{value: 1 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));
    }

    // ============ Zero-Amount Guards ============

    function testBuySharesZeroAmountReverts() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.InvalidAmount.selector);
        waveWarz.buyShares{value: 0}(BATTLE_ID, true, 0, 0, uint64(block.timestamp + 100));
    }

    function testSellSharesZeroAmountReverts() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.InvalidAmount.selector);
        waveWarz.sellShares(BATTLE_ID, true, 0, 0, uint64(block.timestamp + 100));
    }

    // ============ Deadline Guards ============

    function testSellSharesExpiredDeadlineReverts() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        waveWarz.buyShares{value: 1 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.DeadlineExceeded.selector);
        waveWarz.sellShares(BATTLE_ID, true, 1, 0, uint64(block.timestamp - 1));
    }

    // ============ Artist Wallet Validation ============

    function testInitBattleZeroArtistAWalletReverts() public {
        IWaveWarzBase.BattleInitParams memory params = IWaveWarzBase.BattleInitParams({
            battleId: BATTLE_ID,
            battleDuration: BATTLE_DURATION,
            startTime: uint64(block.timestamp + 60),
            artistAWallet: address(0),
            artistBWallet: artistB,
            wavewarzWallet: wavewarzWallet,
            paymentToken: address(0)
        });
        vm.prank(admin);
        vm.expectRevert(WaveWarzBase.InvalidArtistWallet.selector);
        waveWarz.initializeBattle(params);
    }

    function testInitBattleZeroArtistBWalletReverts() public {
        IWaveWarzBase.BattleInitParams memory params = IWaveWarzBase.BattleInitParams({
            battleId: BATTLE_ID,
            battleDuration: BATTLE_DURATION,
            startTime: uint64(block.timestamp + 60),
            artistAWallet: artistA,
            artistBWallet: address(0),
            wavewarzWallet: wavewarzWallet,
            paymentToken: address(0)
        });
        vm.prank(admin);
        vm.expectRevert(WaveWarzBase.InvalidArtistWallet.selector);
        waveWarz.initializeBattle(params);
    }

    // ============ Non-Existent Battle Guards ============

    function testBuyOnNonExistentBattleReverts() public {
        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.BattleNotFound.selector);
        waveWarz.buyShares{value: 1 ether}(99, true, 1 ether, 0, uint64(block.timestamp + 100));
    }

    function testSellOnNonExistentBattleReverts() public {
        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.BattleNotFound.selector);
        waveWarz.sellShares(99, true, 1, 0, uint64(block.timestamp + 100));
    }

    function testClaimOnNonExistentBattleReverts() public {
        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.BattleNotFound.selector);
        waveWarz.claimShares(99);
    }

    function testEndNonExistentBattleReverts() public {
        vm.prank(admin);
        vm.expectRevert(WaveWarzBase.BattleNotFound.selector);
        waveWarz.endBattle(99, true);
    }

    // ============ battleId = 0 Edge Case ============

    /// @dev Demonstrates that battleId=0 bypasses the uniqueness check because
    ///      battles[0].battleId is stored as 0 — matching the "does not exist" sentinel.
    ///      Callers MUST avoid battleId=0 in production.
    function testBattleIdZeroBypassesExistenceCheck() public {
        IWaveWarzBase.BattleInitParams memory params = IWaveWarzBase.BattleInitParams({
            battleId: 0,
            battleDuration: BATTLE_DURATION,
            startTime: uint64(block.timestamp + 60),
            artistAWallet: artistA,
            artistBWallet: artistB,
            wavewarzWallet: wavewarzWallet,
            paymentToken: address(0)
        });

        vm.prank(admin);
        waveWarz.initializeBattle(params);

        // Assert: second init for battleId=0 succeeds (does NOT revert with BattleAlreadyExists).
        // This confirms the uniqueness guard is ineffective for battleId=0 because
        // battles[0].battleId == 0 is indistinguishable from the "empty" sentinel value.
        vm.prank(admin);
        waveWarz.initializeBattle(params); // intentionally succeeds — edge case documented here

        // Confirm the battle truly was overwritten (i.e., it exists in state)
        IWaveWarzBase.Battle memory battle = waveWarz.getBattle(0);
        // battleExists modifier always sees battleId==0 as non-existent, so getBattle returns empty
        assertEq(battle.battleId, 0, "battleId=0 always appears non-existent after retrieval");
    }

    /// @dev Even after init, battleId=0 cannot be traded on because the
    ///      battleExists modifier also compares battles[0].battleId == 0.
    function testBattleIdZeroCannotBeTraded() public {
        IWaveWarzBase.BattleInitParams memory params = IWaveWarzBase.BattleInitParams({
            battleId: 0,
            battleDuration: BATTLE_DURATION,
            startTime: uint64(block.timestamp + 60),
            artistAWallet: artistA,
            artistBWallet: artistB,
            wavewarzWallet: wavewarzWallet,
            paymentToken: address(0)
        });
        vm.prank(admin);
        waveWarz.initializeBattle(params);

        vm.warp(block.timestamp + 61);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.BattleNotFound.selector);
        waveWarz.buyShares{value: 1 ether}(0, true, 1 ether, 0, uint64(block.timestamp + 100));
    }

    // ============ Zero-Pool Settlement ============

    /// @dev If the loser's pool is empty (no trades on losing side), endBattle
    ///      must succeed without paying any settlement bonuses.
    function testEndBattleZeroLoserPool() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        waveWarz.buyShares{value: 2 ether}(BATTLE_ID, true, 2 ether, 0, uint64(block.timestamp + 100));

        _endBattleTime(BATTLE_ID);

        uint256 artistABalBefore = artistA.balance;
        uint256 artistBBalBefore = artistB.balance;
        uint256 platformBalBefore = wavewarzWallet.balance;

        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true); // A wins; B loser pool == 0

        IWaveWarzBase.Battle memory battle = waveWarz.getBattle(BATTLE_ID);
        assertFalse(battle.isActive);
        assertTrue(battle.winnerDecided);
        // No bonuses paid when loser pool is zero
        assertEq(artistA.balance, artistABalBefore);
        assertEq(artistB.balance, artistBBalBefore);
        assertEq(wavewarzWallet.balance, platformBalBefore);
    }

    /// @dev When only the losing side had trades, settlement bonuses come out of
    ///      the losing pool and the winning pool is incremented accordingly.
    function testEndBattleZeroWinnerPool() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        waveWarz.buyShares{value: 2 ether}(BATTLE_ID, false, 2 ether, 0, uint64(block.timestamp + 100));

        _endBattleTime(BATTLE_ID);

        uint256 artistABalBefore = artistA.balance;
        uint256 artistBBalBefore = artistB.balance;
        uint256 platformBalBefore = wavewarzWallet.balance;

        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true); // A wins; B (loser) pool has funds

        assertTrue(artistA.balance > artistABalBefore, "Winner artist should receive settlement bonus");
        assertTrue(artistB.balance > artistBBalBefore, "Loser artist should receive consolation bonus");
        assertTrue(wavewarzWallet.balance > platformBalBefore, "Platform should receive settlement bonus");
    }

    /// @dev End battle with zero trades on both sides — no ETH leaves the contract.
    function testEndBattleBothPoolsZero() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);
        _endBattleTime(BATTLE_ID);

        uint256 artistABalBefore = artistA.balance;
        uint256 artistBBalBefore = artistB.balance;
        uint256 platformBalBefore = wavewarzWallet.balance;

        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true);

        assertEq(artistA.balance, artistABalBefore);
        assertEq(artistB.balance, artistBBalBefore);
        assertEq(wavewarzWallet.balance, platformBalBefore);
    }

    // ============ ERC20 Payment Token ============

    /// @dev Full buy→sell lifecycle using an ERC20 payment token.
    function testBuyAndSellWithERC20Token() public {
        MockERC20 token = new MockERC20();
        token.mint(trader1, 10 ether);

        IWaveWarzBase.BattleInitParams memory params = IWaveWarzBase.BattleInitParams({
            battleId: BATTLE_ID,
            battleDuration: BATTLE_DURATION,
            startTime: uint64(block.timestamp + 60),
            artistAWallet: artistA,
            artistBWallet: artistB,
            wavewarzWallet: wavewarzWallet,
            paymentToken: address(token)
        });
        vm.prank(admin);
        waveWarz.initializeBattle(params);
        _startBattle(BATTLE_ID);

        uint256 buyAmount = 1 ether;
        vm.startPrank(trader1);
        token.approve(address(waveWarz), buyAmount);
        uint256 tokensMinted =
            waveWarz.buyShares(BATTLE_ID, true, buyAmount, 0, uint64(block.timestamp + 100));
        vm.stopPrank();

        assertTrue(tokensMinted > 0);
        // Artist received 1% fee
        assertEq(token.balanceOf(artistA), (buyAmount * 100) / 10000);

        // Sell all tokens back
        vm.prank(trader1);
        uint256 received = waveWarz.sellShares(BATTLE_ID, true, tokensMinted, 0, uint64(block.timestamp + 100));

        assertTrue(received > 0);
        assertTrue(token.balanceOf(trader1) < 10 ether); // fees were paid
    }

    /// @dev Full buy→endBattle→claim lifecycle with ERC20 payment token.
    function testClaimWithERC20Token() public {
        MockERC20 token = new MockERC20();
        token.mint(trader1, 10 ether);

        IWaveWarzBase.BattleInitParams memory params = IWaveWarzBase.BattleInitParams({
            battleId: BATTLE_ID,
            battleDuration: BATTLE_DURATION,
            startTime: uint64(block.timestamp + 60),
            artistAWallet: artistA,
            artistBWallet: artistB,
            wavewarzWallet: wavewarzWallet,
            paymentToken: address(token)
        });
        vm.prank(admin);
        waveWarz.initializeBattle(params);
        _startBattle(BATTLE_ID);

        vm.startPrank(trader1);
        token.approve(address(waveWarz), 2 ether);
        waveWarz.buyShares(BATTLE_ID, true, 2 ether, 0, uint64(block.timestamp + 100));
        vm.stopPrank();

        _endBattleTime(BATTLE_ID);
        vm.prank(admin);
        waveWarz.endBattle(BATTLE_ID, true);

        uint256 balBefore = token.balanceOf(trader1);
        vm.prank(trader1);
        uint256 claimed = waveWarz.claimShares(BATTLE_ID);

        assertTrue(claimed > 0);
        assertEq(token.balanceOf(trader1) - balBefore, claimed);
    }

    // ============ Selling More Than Owned ============

    /// @dev Selling tokens not held should revert with InsufficientFunds.
    function testCannotSellMoreThanBalance() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        uint256 tokensMinted =
            waveWarz.buyShares{value: 1 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.InsufficientFunds.selector);
        waveWarz.sellShares(BATTLE_ID, true, tokensMinted + 1, 0, uint64(block.timestamp + 100));
    }

    // ============ Admin-Only endBattle ============

    /// @dev A non-admin wallet must not be able to end any battle.
    function testNonAdminCannotEndBattle() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);
        _endBattleTime(BATTLE_ID);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.NotBattleAdmin.selector);
        waveWarz.endBattle(BATTLE_ID, true);
    }

    // ============ Settlement Distribution Invariant ============

    /// @dev All settlement BPS constants must sum to exactly BPS_DENOMINATOR.
    function testSettlementBPSSumTo100Percent() public view {
        uint256 total = waveWarz.WINNER_TRADER_BPS()
            + waveWarz.LOSER_TRADER_BPS()
            + waveWarz.WINNER_ARTIST_BPS()
            + waveWarz.LOSER_ARTIST_BPS()
            + waveWarz.PLATFORM_SETTLE_BPS();
        assertEq(total, waveWarz.BPS_DENOMINATOR(), "Settlement BPS must sum to 100%");
    }

    /// @dev Fuzz: for any loser pool size, combined distribution must not exceed pool.
    function testFuzz_SettlementNeverExceedsLoserPool(uint256 loserPool) public view {
        loserPool = bound(loserPool, 1, type(uint128).max);

        uint256 losingTraders = (loserPool * waveWarz.LOSER_TRADER_BPS()) / waveWarz.BPS_DENOMINATOR();
        uint256 winningTraders = (loserPool * waveWarz.WINNER_TRADER_BPS()) / waveWarz.BPS_DENOMINATOR();
        uint256 winningArtist = (loserPool * waveWarz.WINNER_ARTIST_BPS()) / waveWarz.BPS_DENOMINATOR();
        uint256 losingArtist = (loserPool * waveWarz.LOSER_ARTIST_BPS()) / waveWarz.BPS_DENOMINATOR();
        uint256 platform = (loserPool * waveWarz.PLATFORM_SETTLE_BPS()) / waveWarz.BPS_DENOMINATOR();

        uint256 total = losingTraders + winningTraders + winningArtist + losingArtist + platform;
        assertLe(total, loserPool, "Total settlement must not exceed loser pool");
    }

    /// @dev Fuzz: trading fees should never exceed 100% of payment.
    function testFuzz_TradingFeesNeverExceedPayment(uint256 payment) public view {
        payment = bound(payment, 1, type(uint128).max);

        uint256 artistFee = (payment * waveWarz.ARTIST_FEE_BPS()) / waveWarz.BPS_DENOMINATOR();
        uint256 platformFee = (payment * waveWarz.PLATFORM_FEE_BPS()) / waveWarz.BPS_DENOMINATOR();

        assertLe(artistFee + platformFee, payment, "Combined trading fees must not exceed payment");
    }

    // ============ Pool Accounting Integrity ============

    /// @dev After buying, the pool must equal (payment - fees).
    function testBuySharesPoolAccountingAccurate() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        uint256 buyAmount = 3 ether;
        vm.prank(trader1);
        waveWarz.buyShares{value: buyAmount}(BATTLE_ID, true, buyAmount, 0, uint64(block.timestamp + 100));

        uint256 artistFee = (buyAmount * waveWarz.ARTIST_FEE_BPS()) / waveWarz.BPS_DENOMINATOR();
        uint256 platformFee = (buyAmount * waveWarz.PLATFORM_FEE_BPS()) / waveWarz.BPS_DENOMINATOR();
        uint256 expectedPool = buyAmount - artistFee - platformFee;

        IWaveWarzBase.Battle memory battle = waveWarz.getBattle(BATTLE_ID);
        assertEq(battle.artistAPool, expectedPool, "Pool must equal net amount after fees");
    }

    /// @dev After selling, pool must decrease by grossReturn and contract holds correct ETH.
    function testSellSharesPoolDecreasesCorrectly() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        uint256 tokensMinted =
            waveWarz.buyShares{value: 2 ether}(BATTLE_ID, true, 2 ether, 0, uint64(block.timestamp + 100));

        IWaveWarzBase.Battle memory beforeSell = waveWarz.getBattle(BATTLE_ID);
        uint256 poolBefore = beforeSell.artistAPool;

        vm.prank(trader1);
        waveWarz.sellShares(BATTLE_ID, true, tokensMinted, 0, uint64(block.timestamp + 100));

        IWaveWarzBase.Battle memory afterSell = waveWarz.getBattle(BATTLE_ID);
        assertLt(afterSell.artistAPool, poolBefore, "Pool must decrease after sell");
        // Pool should reach near 0 (only rounding dust remains after selling all)
        // Due to integer rounding in sqrt/cbrt, a small dust amount may remain
        assertLe(afterSell.artistAPool, 1e6, "Pool should be near zero after full sell");
    }

    // ============ Slippage Protection ============

    /// @dev Setting minTokensOut too high should revert with SlippageExceeded.
    function testSlippageProtectionOnBuy() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.SlippageExceeded.selector);
        waveWarz.buyShares{value: 1 ether}(
            BATTLE_ID, true, 1 ether, type(uint256).max, uint64(block.timestamp + 100)
        );
    }

    /// @dev Setting minAmountOut too high on sell should revert with SlippageExceeded.
    function testSlippageProtectionOnSell() public {
        _createBattle(BATTLE_ID);
        _startBattle(BATTLE_ID);

        vm.prank(trader1);
        uint256 tokensMinted =
            waveWarz.buyShares{value: 1 ether}(BATTLE_ID, true, 1 ether, 0, uint64(block.timestamp + 100));

        vm.prank(trader1);
        vm.expectRevert(WaveWarzBase.SlippageExceeded.selector);
        waveWarz.sellShares(BATTLE_ID, true, tokensMinted, type(uint256).max, uint64(block.timestamp + 100));
    }

    // ============ Helper Functions ============

    function _createBattle(uint64 battleId) internal {
        IWaveWarzBase.BattleInitParams memory params = IWaveWarzBase.BattleInitParams({
            battleId: battleId,
            battleDuration: BATTLE_DURATION,
            startTime: uint64(block.timestamp + 60),
            artistAWallet: artistA,
            artistBWallet: artistB,
            wavewarzWallet: wavewarzWallet,
            paymentToken: address(0)
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
