// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IWaveWarzBase
 * @notice Interface for WaveWarz Base battle platform
 */
interface IWaveWarzBase {
    // Events
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

    // Structs
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

    // View functions
    function getBattle(uint64 battleId) external view returns (Battle memory);
    function getArtistAToken(uint64 battleId) external view returns (address);
    function getArtistBToken(uint64 battleId) external view returns (address);
    function calculateBuyPrice(uint256 currentSupply, uint256 tokensToMint) external pure returns (uint256);
    function calculateSellReturn(uint256 currentSupply, uint256 tokensToSell) external pure returns (uint256);

    // State-changing functions
    function initializeBattle(BattleInitParams calldata params) external;
    function buyShares(
        uint64 battleId,
        bool artistA,
        uint256 amount,
        uint256 minTokensOut,
        uint64 deadline
    ) external payable returns (uint256 tokensMinted);
    function sellShares(
        uint64 battleId,
        bool artistA,
        uint256 tokenAmount,
        uint256 minAmountOut,
        uint64 deadline
    ) external returns (uint256 amountReceived);
    function endBattle(uint64 battleId, bool winnerIsArtistA) external;
    function claimShares(uint64 battleId) external returns (uint256 amountReceived);
}
