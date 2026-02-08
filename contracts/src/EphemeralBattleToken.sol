// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title EphemeralBattleToken
 * @notice Minimal ERC20 token for battle shares - destroyed at settlement
 * @dev Only the WaveWarz contract can mint/burn tokens
 */
contract EphemeralBattleToken is ERC20 {
    address public immutable battleContract;
    uint64 public immutable battleId;
    bool public immutable isArtistA;

    error OnlyBattleContract();

    modifier onlyBattleContract() {
        if (msg.sender != battleContract) revert OnlyBattleContract();
        _;
    }

    constructor(
        uint64 _battleId,
        bool _isArtistA,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) {
        battleContract = msg.sender;
        battleId = _battleId;
        isArtistA = _isArtistA;
    }

    /**
     * @notice Mint tokens to a trader (only callable by battle contract)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyBattleContract {
        _mint(to, amount);
    }

    /**
     * @notice Burn tokens from a trader (only callable by battle contract)
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burn(address from, uint256 amount) external onlyBattleContract {
        _burn(from, amount);
    }

    /**
     * @notice Get token balance for a trader
     * @param account Address to check balance
     * @return Balance of tokens
     */
    function balanceOf(address account) public view override returns (uint256) {
        return super.balanceOf(account);
    }

    /**
     * @notice Decimals for the token (18 like ETH)
     */
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
