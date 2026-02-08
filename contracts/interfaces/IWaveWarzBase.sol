// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IWaveWarzBase
 * @notice Interface for WaveWarz Base battle platform
 * @dev External interface for integrators and agents
 */
interface IWaveWarzBase {
    // ============ Events ============

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

    event SharesSold(
        uint64 indexed battleId,
        address indexed trader,
        bool artistA,
        uint256 tokenAmount,
        uint256 paymentReceived,
        uint256 artistFee,
        uint256 platformFee
    );

    event BattleEnded(
        uint64 indexed battleId,
        bool winnerIsArtistA,
        uint256 artistAPool,
        uint256 artistBPool
    );

    event SharesClaimed(
        uint64 indexed battleId,
        address indexed trader,
        uint256 amountReceived
    );

    // ============ Structs ============

    struct Battle {
        uint64 battleId;
        uint64 startTime;
        uint64 endTime;
        address artistAWallet;
        address artistBWallet;
        address wavewarzWallet;
        uint256 artistAPool;
        uint256 artistBPool;
        uint256 artistASupply;
        uint256 artistBSupply;
        bool winnerDecided;
        bool winnerIsArtistA;
        bool isActive;
        address paymentToken;
        address admin;
    }

    struct BattleInitParams {
        uint64 battleId;
        uint64 battleDuration;
        uint64 startTime;
        address artistAWallet;
        address artistBWallet;
        address wavewarzWallet;
        address paymentToken;
    }

    // ============ View Functions ============

    /**
     * @notice Get battle details
     * @param battleId The battle ID
     * @return Battle struct with all details
     */
    function getBattle(uint64 battleId) external view returns (Battle memory);

    /**
     * @notice Get Artist A token address for a battle
     * @param battleId The battle ID
     * @return Token contract address
     */
    function getArtistAToken(uint64 battleId) external view returns (address);

    /**
     * @notice Get Artist B token address for a battle
     * @param battleId The battle ID
     * @return Token contract address
     */
    function getArtistBToken(uint64 battleId) external view returns (address);

    /**
     * @notice Calculate cost to buy tokens (square root bonding curve)
     * @param currentSupply Current token supply
     * @param tokensToMint Tokens to purchase
     * @return Cost in payment token
     */
    function calculateBuyPrice(
        uint256 currentSupply,
        uint256 tokensToMint
    ) external pure returns (uint256);

    /**
     * @notice Calculate return from selling tokens
     * @param currentSupply Current token supply
     * @param tokensToSell Tokens to sell
     * @return Return in payment token
     */
    function calculateSellReturn(
        uint256 currentSupply,
        uint256 tokensToSell
    ) external pure returns (uint256);

    // ============ State-Changing Functions ============

    /**
     * @notice Initialize a new battle
     * @param params Battle initialization parameters
     */
    function initializeBattle(BattleInitParams calldata params) external;

    /**
     * @notice Buy shares for an artist via bonding curve
     * @param battleId The battle ID
     * @param artistA True for Artist A, false for Artist B
     * @param amount Amount of payment token
     * @param minTokensOut Minimum tokens to receive (slippage protection)
     * @param deadline Transaction deadline timestamp
     * @return tokensMinted Amount of tokens minted to trader
     */
    function buyShares(
        uint64 battleId,
        bool artistA,
        uint256 amount,
        uint256 minTokensOut,
        uint64 deadline
    ) external payable returns (uint256 tokensMinted);

    /**
     * @notice Sell shares back to bonding curve
     * @param battleId The battle ID
     * @param artistA True for Artist A, false for Artist B
     * @param tokenAmount Amount of tokens to sell
     * @param minAmountOut Minimum payment to receive (slippage protection)
     * @param deadline Transaction deadline timestamp
     * @return amountReceived Amount of payment token received
     */
    function sellShares(
        uint64 battleId,
        bool artistA,
        uint256 tokenAmount,
        uint256 minAmountOut,
        uint64 deadline
    ) external returns (uint256 amountReceived);

    /**
     * @notice End a battle and distribute artist/platform settlement bonuses
     * @param battleId The battle ID
     * @param winnerIsArtistA True if Artist A wins, false if Artist B wins
     */
    function endBattle(uint64 battleId, bool winnerIsArtistA) external;

    /**
     * @notice Claim proportional winnings after battle settlement
     * @param battleId The battle ID
     * @return amountReceived Amount of payment token received
     */
    function claimShares(uint64 battleId) external returns (uint256 amountReceived);
}
