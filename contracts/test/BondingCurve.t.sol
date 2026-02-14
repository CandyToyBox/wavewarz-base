// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/WaveWarzBase.sol";

contract BondingCurveTest is Test {
    WaveWarzBase public wavewarz;
    address public admin;
    address public artistA;
    address public artistB;
    address public wavewarzWallet;

    function setUp() public {
        admin = makeAddr("admin");
        artistA = makeAddr("artistA");
        artistB = makeAddr("artistB");
        wavewarzWallet = makeAddr("wavewarzWallet");

        vm.prank(admin);
        wavewarz = new WaveWarzBase();
    }

    function _createAndStartBattle(uint64 battleId) internal {
        vm.prank(admin);
        wavewarz.initializeBattle(
            IWaveWarzBase.BattleInitParams({
                battleId: battleId,
                battleDuration: 3600,
                startTime: uint64(block.timestamp + 1),
                artistAWallet: artistA,
                artistBWallet: artistB,
                wavewarzWallet: wavewarzWallet,
                paymentToken: address(0)
            })
        );
        vm.warp(block.timestamp + 2);
    }

    // Fuzz: price always increases with supply
    function testFuzz_PriceIncreasesWithSupply(uint256 supply1, uint256 supply2) public view {
        supply1 = bound(supply1, 0, 1e24);
        supply2 = bound(supply2, supply1 + 1, 1e24 + 1);
        uint256 tokensToMint = 1e18; // 1 token

        if (supply1 + tokensToMint > 1e24 || supply2 + tokensToMint > 1e24 + 1) return;

        uint256 price1 = wavewarz.calculateBuyPrice(supply1, tokensToMint);
        uint256 price2 = wavewarz.calculateBuyPrice(supply2, tokensToMint);

        assertGe(price2, price1, "Price must increase with supply");
    }

    // Fuzz: buy price > 0 for meaningful amounts (above rounding threshold)
    function testFuzz_BuyPriceNonZero(uint256 supply, uint256 tokens) public view {
        supply = bound(supply, 0, 1e24);
        tokens = bound(tokens, 1e12, 1e22); // min 1e12 to avoid integer rounding to 0

        uint256 price = wavewarz.calculateBuyPrice(supply, tokens);
        assertGt(price, 0, "Buy price must be > 0 for non-zero tokens");
    }

    // Fuzz: sell return <= buy price (no arbitrage)
    function testFuzz_NoArbitrage(uint256 supply, uint256 tokens) public view {
        supply = bound(supply, 1e18, 1e24);
        tokens = bound(tokens, 1e15, supply);

        uint256 sellReturn = wavewarz.calculateSellReturn(supply, tokens);
        uint256 buyPrice = wavewarz.calculateBuyPrice(supply - tokens, tokens);

        assertLe(sellReturn, buyPrice, "Sell return must not exceed buy price");
    }

    // Fuzz: settlement distribution sums to 100%
    function testFuzz_SettlementSumsTo100(uint256 loserPool) public pure {
        loserPool = bound(loserPool, 1e15, 1e30);

        uint256 losingTraders = (loserPool * 5000) / 10000;
        uint256 winningTraders = (loserPool * 4000) / 10000;
        uint256 winningArtist = (loserPool * 500) / 10000;
        uint256 losingArtist = (loserPool * 200) / 10000;
        uint256 platform = (loserPool * 300) / 10000;

        uint256 total = losingTraders + winningTraders + winningArtist + losingArtist + platform;

        // Due to integer division, total may be slightly less than loserPool
        assertLe(total, loserPool, "Distribution must not exceed pool");
        // Rounding loss should be minimal (< 5 wei per division = < 25 wei total)
        assertGe(total, loserPool - 25, "Rounding loss must be minimal");
    }

    // Fuzz: trading with random amounts doesn't revert
    function testFuzz_BuyDoesNotRevert(uint256 amount) public {
        amount = bound(amount, 0.001 ether, 10 ether);

        _createAndStartBattle(1);

        address trader = makeAddr("fuzzTrader");
        vm.deal(trader, amount);

        vm.prank(trader);
        wavewarz.buyShares{value: amount}(
            1,
            true,
            amount,
            0, // no slippage protection for fuzz
            uint64(block.timestamp + 300)
        );
    }

    // Gas: measure buy/sell/claim gas costs
    function test_GasBuyShares() public {
        _createAndStartBattle(1);
        address trader = makeAddr("gasTester");
        vm.deal(trader, 1 ether);

        vm.prank(trader);
        uint256 gasBefore = gasleft();
        wavewarz.buyShares{value: 0.1 ether}(1, true, 0.1 ether, 0, uint64(block.timestamp + 300));
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("buyShares gas", gasUsed);
        assertLt(gasUsed, 500_000, "buyShares should use < 500k gas");
    }

    function test_GasSellShares() public {
        _createAndStartBattle(1);
        address trader = makeAddr("gasTester");
        vm.deal(trader, 1 ether);

        // Buy first
        vm.prank(trader);
        wavewarz.buyShares{value: 0.1 ether}(1, true, 0.1 ether, 0, uint64(block.timestamp + 300));

        // Get token balance
        address tokenAddr = wavewarz.getArtistAToken(1);
        uint256 balance = IERC20(tokenAddr).balanceOf(trader);

        // Sell half
        vm.prank(trader);
        uint256 gasBefore = gasleft();
        wavewarz.sellShares(1, true, balance / 2, 0, uint64(block.timestamp + 300));
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("sellShares gas", gasUsed);
        assertLt(gasUsed, 500_000, "sellShares should use < 500k gas");
    }

    function test_GasClaimShares() public {
        _createAndStartBattle(1);
        address trader = makeAddr("gasTester");
        vm.deal(trader, 1 ether);

        // Buy
        vm.prank(trader);
        wavewarz.buyShares{value: 0.1 ether}(1, true, 0.1 ether, 0, uint64(block.timestamp + 300));

        // End battle
        vm.warp(block.timestamp + 3601);
        vm.prank(admin);
        wavewarz.endBattle(1, true);

        // Claim
        vm.prank(trader);
        uint256 gasBefore = gasleft();
        wavewarz.claimShares(1);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("claimShares gas", gasUsed);
        assertLt(gasUsed, 500_000, "claimShares should use < 500k gas");
    }
}
