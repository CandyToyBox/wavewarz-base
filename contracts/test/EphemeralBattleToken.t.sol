// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/EphemeralBattleToken.sol";

contract EphemeralBattleTokenTest is Test {
    EphemeralBattleToken public tokenA;
    EphemeralBattleToken public tokenB;

    address public battleContract = address(this); // Test contract acts as battle contract
    address public trader1 = address(1);
    address public trader2 = address(2);
    address public unauthorized = address(3);

    uint64 public constant BATTLE_ID = 42;

    function setUp() public {
        // Deploy as the battle contract (msg.sender becomes battleContract)
        tokenA = new EphemeralBattleToken(
            BATTLE_ID,
            true,
            "WaveWarz Battle 42 Artist A",
            "WW42A"
        );

        tokenB = new EphemeralBattleToken(
            BATTLE_ID,
            false,
            "WaveWarz Battle 42 Artist B",
            "WW42B"
        );
    }

    // ============ Deployment / Immutables ============

    function test_Deployment_BattleContractIsDeployer() public {
        assertEq(tokenA.battleContract(), address(this));
    }

    function test_Deployment_BattleId() public {
        assertEq(tokenA.battleId(), BATTLE_ID);
        assertEq(tokenB.battleId(), BATTLE_ID);
    }

    function test_Deployment_IsArtistA_Flag() public {
        assertTrue(tokenA.isArtistA());
        assertFalse(tokenB.isArtistA());
    }

    function test_Deployment_Name() public {
        assertEq(tokenA.name(), "WaveWarz Battle 42 Artist A");
        assertEq(tokenB.name(), "WaveWarz Battle 42 Artist B");
    }

    function test_Deployment_Symbol() public {
        assertEq(tokenA.symbol(), "WW42A");
        assertEq(tokenB.symbol(), "WW42B");
    }

    function test_Deployment_Decimals() public {
        assertEq(tokenA.decimals(), 18);
        assertEq(tokenB.decimals(), 18);
    }

    function test_Deployment_InitialSupplyIsZero() public {
        assertEq(tokenA.totalSupply(), 0);
        assertEq(tokenB.totalSupply(), 0);
    }

    // ============ Mint Tests ============

    function test_Mint_BattleContractCanMint() public {
        tokenA.mint(trader1, 1000 ether);

        assertEq(tokenA.balanceOf(trader1), 1000 ether);
        assertEq(tokenA.totalSupply(), 1000 ether);
    }

    function test_Mint_MultipleAddresses() public {
        tokenA.mint(trader1, 100 ether);
        tokenA.mint(trader2, 200 ether);

        assertEq(tokenA.balanceOf(trader1), 100 ether);
        assertEq(tokenA.balanceOf(trader2), 200 ether);
        assertEq(tokenA.totalSupply(), 300 ether);
    }

    function test_Mint_RevertIfUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert(EphemeralBattleToken.OnlyBattleContract.selector);
        tokenA.mint(trader1, 100 ether);
    }

    function test_Mint_TokensAreIndependentPerArtist() public {
        tokenA.mint(trader1, 100 ether);
        tokenB.mint(trader1, 200 ether);

        assertEq(tokenA.balanceOf(trader1), 100 ether);
        assertEq(tokenB.balanceOf(trader1), 200 ether);
        assertEq(tokenA.totalSupply(), 100 ether);
        assertEq(tokenB.totalSupply(), 200 ether);
    }

    // ============ Burn Tests ============

    function test_Burn_BattleContractCanBurn() public {
        tokenA.mint(trader1, 1000 ether);
        tokenA.burn(trader1, 400 ether);

        assertEq(tokenA.balanceOf(trader1), 600 ether);
        assertEq(tokenA.totalSupply(), 600 ether);
    }

    function test_Burn_EntireBalance() public {
        tokenA.mint(trader1, 100 ether);
        tokenA.burn(trader1, 100 ether);

        assertEq(tokenA.balanceOf(trader1), 0);
        assertEq(tokenA.totalSupply(), 0);
    }

    function test_Burn_RevertIfUnauthorized() public {
        tokenA.mint(trader1, 100 ether);

        vm.prank(unauthorized);
        vm.expectRevert(EphemeralBattleToken.OnlyBattleContract.selector);
        tokenA.burn(trader1, 100 ether);
    }

    function test_Burn_RevertIfExceedsBalance() public {
        tokenA.mint(trader1, 100 ether);

        // Standard ERC20 reverts on burn > balance
        vm.expectRevert();
        tokenA.burn(trader1, 200 ether);
    }

    // ============ ERC20 Transfer Tests ============

    function test_Transfer_StandardERC20Works() public {
        tokenA.mint(trader1, 100 ether);

        vm.prank(trader1);
        tokenA.transfer(trader2, 40 ether);

        assertEq(tokenA.balanceOf(trader1), 60 ether);
        assertEq(tokenA.balanceOf(trader2), 40 ether);
    }

    function test_Approval_StandardERC20Works() public {
        tokenA.mint(trader1, 100 ether);

        vm.prank(trader1);
        tokenA.approve(trader2, 50 ether);

        vm.prank(trader2);
        tokenA.transferFrom(trader1, trader2, 50 ether);

        assertEq(tokenA.balanceOf(trader1), 50 ether);
        assertEq(tokenA.balanceOf(trader2), 50 ether);
    }

    function test_BalanceOf_ReturnsZeroForUnknownAddress() public {
        assertEq(tokenA.balanceOf(address(99)), 0);
    }

    // ============ Access Control Invariants ============

    function test_OnlyBattleContract_CanMintAndBurn() public {
        // Deploy a second token from a different address
        vm.prank(trader1);
        EphemeralBattleToken externalToken = new EphemeralBattleToken(
            999,
            true,
            "External Battle Token",
            "EBT"
        );

        // trader1 is the battle contract for externalToken
        vm.prank(trader1);
        externalToken.mint(trader2, 100 ether);
        assertEq(externalToken.balanceOf(trader2), 100 ether);

        // address(this) cannot mint externalToken
        vm.expectRevert(EphemeralBattleToken.OnlyBattleContract.selector);
        externalToken.mint(trader2, 100 ether);
    }
}
