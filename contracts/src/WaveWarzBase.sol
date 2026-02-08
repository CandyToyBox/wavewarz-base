// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./IWaveWarzBase.sol";
import "./EphemeralBattleToken.sol";

/**
 * @title WaveWarzBase
 * @notice Decentralized music battle platform on Base blockchain
 * @dev Fully immutable - no upgrade capability. AI agents battle, traders speculate.
 *
 * Fee Structure (immutable, hardcoded):
 * - Artist receives 1.0% of all trading volume (instant payout)
 * - Platform receives 0.5% of all trading volume
 * - At settlement, loser's pool distributed:
 *   - 50% to losing traders (risk mitigation)
 *   - 40% to winning traders (proportional)
 *   - 5% to winning artist
 *   - 2% to losing artist
 *   - 3% to platform
 */
contract WaveWarzBase is IWaveWarzBase, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Immutable Fee Constants (basis points) ============
    uint256 public constant ARTIST_FEE_BPS = 100;       // 1.0%
    uint256 public constant PLATFORM_FEE_BPS = 50;       // 0.5%
    uint256 public constant WINNER_TRADER_BPS = 4000;    // 40% of loser pool
    uint256 public constant LOSER_TRADER_BPS = 5000;     // 50% of loser pool
    uint256 public constant WINNER_ARTIST_BPS = 500;     // 5% of loser pool
    uint256 public constant LOSER_ARTIST_BPS = 200;      // 2% of loser pool
    uint256 public constant PLATFORM_SETTLE_BPS = 300;   // 3% of loser pool
    uint256 public constant BPS_DENOMINATOR = 10000;

    // ============ Bonding Curve Constants ============
    uint256 public constant PRICE_SCALE = 1e18;          // Scale factor for sqrt calculations

    // ============ State Variables ============
    mapping(uint64 => Battle) public battles;
    mapping(uint64 => address) public artistATokens;
    mapping(uint64 => address) public artistBTokens;
    mapping(uint64 => mapping(address => bool)) public hasClaimed;

    // ============ Errors ============
    error BattleAlreadyExists();
    error BattleNotFound();
    error BattleNotActive();
    error BattleStillActive();
    error BattleAlreadyEnded();
    error WinnerAlreadyDecided();
    error WinnerNotDecided();
    error InvalidDuration();
    error InvalidStartTime();
    error InvalidArtistWallet();
    error InvalidAmount();
    error SlippageExceeded();
    error DeadlineExceeded();
    error InsufficientFunds();
    error ETHTransferFailed();
    error NotBattleAdmin();
    error AlreadyClaimed();
    error NoTokensToClaim();
    error InvalidPaymentToken();

    // ============ Modifiers ============
    modifier battleExists(uint64 battleId) {
        if (battles[battleId].battleId == 0) revert BattleNotFound();
        _;
    }

    modifier onlyBattleAdmin(uint64 battleId) {
        if (msg.sender != battles[battleId].admin) revert NotBattleAdmin();
        _;
    }

    // ============ Constructor ============
    constructor() {
        // Fully immutable - no initialization needed
    }

    // ============ External Functions ============

    /**
     * @notice Initialize a new battle
     * @param params Battle initialization parameters
     */
    function initializeBattle(BattleInitParams calldata params) external {
        if (battles[params.battleId].battleId != 0) revert BattleAlreadyExists();
        if (params.battleDuration == 0) revert InvalidDuration();
        if (params.startTime < block.timestamp) revert InvalidStartTime();
        if (params.artistAWallet == address(0) || params.artistBWallet == address(0)) {
            revert InvalidArtistWallet();
        }
        // paymentToken = address(0) means ETH, otherwise must be valid ERC20

        uint64 endTime = params.startTime + params.battleDuration;

        // Create battle state
        battles[params.battleId] = Battle({
            battleId: params.battleId,
            startTime: params.startTime,
            endTime: endTime,
            artistAWallet: params.artistAWallet,
            artistBWallet: params.artistBWallet,
            wavewarzWallet: params.wavewarzWallet,
            artistAPool: 0,
            artistBPool: 0,
            artistASupply: 0,
            artistBSupply: 0,
            winnerDecided: false,
            winnerIsArtistA: false,
            isActive: true,
            paymentToken: params.paymentToken,
            admin: msg.sender
        });

        // Deploy ephemeral tokens for this battle
        string memory battleIdStr = _uint64ToString(params.battleId);

        EphemeralBattleToken tokenA = new EphemeralBattleToken(
            params.battleId,
            true,
            string(abi.encodePacked("WaveWarz Battle ", battleIdStr, " Artist A")),
            string(abi.encodePacked("WW", battleIdStr, "A"))
        );

        EphemeralBattleToken tokenB = new EphemeralBattleToken(
            params.battleId,
            false,
            string(abi.encodePacked("WaveWarz Battle ", battleIdStr, " Artist B")),
            string(abi.encodePacked("WW", battleIdStr, "B"))
        );

        artistATokens[params.battleId] = address(tokenA);
        artistBTokens[params.battleId] = address(tokenB);

        emit BattleCreated(
            params.battleId,
            params.artistAWallet,
            params.artistBWallet,
            params.startTime,
            endTime,
            params.paymentToken
        );
    }

    /**
     * @notice Buy shares for an artist via bonding curve
     * @param battleId The battle ID
     * @param artistA True for Artist A, false for Artist B
     * @param amount Amount of payment token (ETH in wei or ERC20 amount)
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
    ) external payable nonReentrant battleExists(battleId) returns (uint256 tokensMinted) {
        Battle storage battle = battles[battleId];

        // Validations
        if (!battle.isActive) revert BattleNotActive();
        if (block.timestamp < battle.startTime || block.timestamp > battle.endTime) {
            revert BattleNotActive();
        }
        if (block.timestamp > deadline) revert DeadlineExceeded();
        if (amount == 0) revert InvalidAmount();

        // Handle payment
        uint256 paymentReceived;
        if (battle.paymentToken == address(0)) {
            // ETH payment
            if (msg.value != amount) revert InsufficientFunds();
            paymentReceived = msg.value;
        } else {
            // ERC20 payment
            if (msg.value != 0) revert InvalidPaymentToken();
            IERC20(battle.paymentToken).safeTransferFrom(msg.sender, address(this), amount);
            paymentReceived = amount;
        }

        // Calculate fees (deducted before bonding curve)
        uint256 artistFee = (paymentReceived * ARTIST_FEE_BPS) / BPS_DENOMINATOR;
        uint256 platformFee = (paymentReceived * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 netAmount = paymentReceived - artistFee - platformFee;

        // Calculate tokens to mint based on bonding curve
        uint256 currentSupply = artistA ? battle.artistASupply : battle.artistBSupply;
        tokensMinted = _calculateTokensForPayment(currentSupply, netAmount);

        if (tokensMinted < minTokensOut) revert SlippageExceeded();

        // Update state
        if (artistA) {
            battle.artistAPool += netAmount;
            battle.artistASupply += tokensMinted;
        } else {
            battle.artistBPool += netAmount;
            battle.artistBSupply += tokensMinted;
        }

        // Mint tokens to trader
        EphemeralBattleToken token = EphemeralBattleToken(
            artistA ? artistATokens[battleId] : artistBTokens[battleId]
        );
        token.mint(msg.sender, tokensMinted);

        // Pay artist fee immediately
        address artistWallet = artistA ? battle.artistAWallet : battle.artistBWallet;
        _transferPayment(battle.paymentToken, artistWallet, artistFee);

        // Pay platform fee
        _transferPayment(battle.paymentToken, battle.wavewarzWallet, platformFee);

        emit SharesPurchased(
            battleId,
            msg.sender,
            artistA,
            tokensMinted,
            paymentReceived,
            artistFee,
            platformFee
        );
    }

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
    ) external nonReentrant battleExists(battleId) returns (uint256 amountReceived) {
        Battle storage battle = battles[battleId];

        // Validations
        if (!battle.isActive) revert BattleNotActive();
        if (block.timestamp < battle.startTime || block.timestamp > battle.endTime) {
            revert BattleNotActive();
        }
        if (block.timestamp > deadline) revert DeadlineExceeded();
        if (tokenAmount == 0) revert InvalidAmount();

        // Get token contract
        EphemeralBattleToken token = EphemeralBattleToken(
            artistA ? artistATokens[battleId] : artistBTokens[battleId]
        );

        // Verify trader has tokens
        if (token.balanceOf(msg.sender) < tokenAmount) revert InsufficientFunds();

        // Calculate return based on bonding curve
        uint256 currentSupply = artistA ? battle.artistASupply : battle.artistBSupply;
        uint256 grossReturn = calculateSellReturn(currentSupply, tokenAmount);

        // Calculate fees
        uint256 artistFee = (grossReturn * ARTIST_FEE_BPS) / BPS_DENOMINATOR;
        uint256 platformFee = (grossReturn * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        amountReceived = grossReturn - artistFee - platformFee;

        if (amountReceived < minAmountOut) revert SlippageExceeded();

        // Check pool has sufficient funds
        uint256 currentPool = artistA ? battle.artistAPool : battle.artistBPool;
        if (grossReturn > currentPool) revert InsufficientFunds();

        // Update state
        if (artistA) {
            battle.artistAPool -= grossReturn;
            battle.artistASupply -= tokenAmount;
        } else {
            battle.artistBPool -= grossReturn;
            battle.artistBSupply -= tokenAmount;
        }

        // Burn tokens
        token.burn(msg.sender, tokenAmount);

        // Pay trader
        _transferPayment(battle.paymentToken, msg.sender, amountReceived);

        // Pay artist fee
        address artistWallet = artistA ? battle.artistAWallet : battle.artistBWallet;
        _transferPayment(battle.paymentToken, artistWallet, artistFee);

        // Pay platform fee
        _transferPayment(battle.paymentToken, battle.wavewarzWallet, platformFee);

        emit SharesSold(
            battleId,
            msg.sender,
            artistA,
            tokenAmount,
            amountReceived,
            artistFee,
            platformFee
        );
    }

    /**
     * @notice End a battle and distribute artist/platform settlement bonuses
     * @param battleId The battle ID
     * @param winnerIsArtistA True if Artist A wins, false if Artist B wins
     */
    function endBattle(
        uint64 battleId,
        bool winnerIsArtistA
    ) external nonReentrant battleExists(battleId) onlyBattleAdmin(battleId) {
        Battle storage battle = battles[battleId];

        if (!battle.isActive) revert BattleAlreadyEnded();
        if (block.timestamp < battle.endTime) revert BattleStillActive();
        if (battle.winnerDecided) revert WinnerAlreadyDecided();

        // Mark battle as ended
        battle.isActive = false;
        battle.winnerDecided = true;
        battle.winnerIsArtistA = winnerIsArtistA;

        // Calculate loser's pool for settlement bonuses
        uint256 loserPool = winnerIsArtistA ? battle.artistBPool : battle.artistAPool;

        if (loserPool > 0) {
            // Calculate settlement amounts
            uint256 winnerArtistBonus = (loserPool * WINNER_ARTIST_BPS) / BPS_DENOMINATOR;
            uint256 loserArtistBonus = (loserPool * LOSER_ARTIST_BPS) / BPS_DENOMINATOR;
            uint256 platformBonus = (loserPool * PLATFORM_SETTLE_BPS) / BPS_DENOMINATOR;

            // Pay winning artist settlement bonus
            address winnerWallet = winnerIsArtistA ? battle.artistAWallet : battle.artistBWallet;
            _transferPayment(battle.paymentToken, winnerWallet, winnerArtistBonus);

            // Pay losing artist settlement bonus
            address loserWallet = winnerIsArtistA ? battle.artistBWallet : battle.artistAWallet;
            _transferPayment(battle.paymentToken, loserWallet, loserArtistBonus);

            // Pay platform settlement bonus
            _transferPayment(battle.paymentToken, battle.wavewarzWallet, platformBonus);

            // Update pools to reflect settlement deductions
            // Remaining in loser pool: 50% for losers + 40% for winners = 90%
            uint256 traderShare = (loserPool * (WINNER_TRADER_BPS + LOSER_TRADER_BPS)) / BPS_DENOMINATOR;
            if (winnerIsArtistA) {
                battle.artistBPool = (loserPool * LOSER_TRADER_BPS) / BPS_DENOMINATOR;
                // Add winner bonus to winner pool for claiming
                battle.artistAPool += (loserPool * WINNER_TRADER_BPS) / BPS_DENOMINATOR;
            } else {
                battle.artistAPool = (loserPool * LOSER_TRADER_BPS) / BPS_DENOMINATOR;
                battle.artistBPool += (loserPool * WINNER_TRADER_BPS) / BPS_DENOMINATOR;
            }
        }

        emit BattleEnded(battleId, winnerIsArtistA, battle.artistAPool, battle.artistBPool);
    }

    /**
     * @notice Claim proportional winnings after battle settlement
     * @param battleId The battle ID
     * @return amountReceived Amount of payment token received
     */
    function claimShares(
        uint64 battleId
    ) external nonReentrant battleExists(battleId) returns (uint256 amountReceived) {
        Battle storage battle = battles[battleId];

        if (!battle.winnerDecided) revert WinnerNotDecided();
        if (hasClaimed[battleId][msg.sender]) revert AlreadyClaimed();

        EphemeralBattleToken tokenA = EphemeralBattleToken(artistATokens[battleId]);
        EphemeralBattleToken tokenB = EphemeralBattleToken(artistBTokens[battleId]);

        uint256 balanceA = tokenA.balanceOf(msg.sender);
        uint256 balanceB = tokenB.balanceOf(msg.sender);

        if (balanceA == 0 && balanceB == 0) revert NoTokensToClaim();

        amountReceived = 0;

        // Calculate payout for Artist A tokens
        if (balanceA > 0 && battle.artistASupply > 0) {
            uint256 shareOfPoolA = (balanceA * battle.artistAPool) / battle.artistASupply;
            amountReceived += shareOfPoolA;
            tokenA.burn(msg.sender, balanceA);
        }

        // Calculate payout for Artist B tokens
        if (balanceB > 0 && battle.artistBSupply > 0) {
            uint256 shareOfPoolB = (balanceB * battle.artistBPool) / battle.artistBSupply;
            amountReceived += shareOfPoolB;
            tokenB.burn(msg.sender, balanceB);
        }

        hasClaimed[battleId][msg.sender] = true;

        // Transfer payout
        if (amountReceived > 0) {
            _transferPayment(battle.paymentToken, msg.sender, amountReceived);
        }

        emit SharesClaimed(battleId, msg.sender, amountReceived);
    }

    // ============ View Functions ============

    /**
     * @notice Get battle details
     * @param battleId The battle ID
     * @return Battle struct
     */
    function getBattle(uint64 battleId) external view returns (Battle memory) {
        return battles[battleId];
    }

    /**
     * @notice Get Artist A token address for a battle
     */
    function getArtistAToken(uint64 battleId) external view returns (address) {
        return artistATokens[battleId];
    }

    /**
     * @notice Get Artist B token address for a battle
     */
    function getArtistBToken(uint64 battleId) external view returns (address) {
        return artistBTokens[battleId];
    }

    /**
     * @notice Calculate cost to buy tokens (square root bonding curve)
     * @param currentSupply Current token supply
     * @param tokensToMint Tokens to purchase
     * @return Cost in payment token
     */
    function calculateBuyPrice(
        uint256 currentSupply,
        uint256 tokensToMint
    ) public pure returns (uint256) {
        if (tokensToMint == 0) return 0;

        // Integral of sqrt(x) from currentSupply to (currentSupply + tokensToMint)
        // = (2/3) * [x^(3/2)] evaluated from a to b
        // = (2/3) * (b^(3/2) - a^(3/2))
        uint256 a = currentSupply;
        uint256 b = currentSupply + tokensToMint;

        // Scale calculations to avoid precision loss
        uint256 a3_2 = _sqrt(a * a * a);
        uint256 b3_2 = _sqrt(b * b * b);

        return (2 * (b3_2 - a3_2)) / 3;
    }

    /**
     * @notice Calculate return from selling tokens
     * @param currentSupply Current token supply
     * @param tokensToSell Tokens to sell
     * @return Return in payment token
     */
    function calculateSellReturn(
        uint256 currentSupply,
        uint256 tokensToSell
    ) public pure returns (uint256) {
        if (tokensToSell == 0 || tokensToSell > currentSupply) return 0;

        // Integral of sqrt(x) from (currentSupply - tokensToSell) to currentSupply
        uint256 a = currentSupply - tokensToSell;
        uint256 b = currentSupply;

        uint256 a3_2 = _sqrt(a * a * a);
        uint256 b3_2 = _sqrt(b * b * b);

        return (2 * (b3_2 - a3_2)) / 3;
    }

    // ============ Internal Functions ============

    /**
     * @dev Calculate tokens minted for a given payment amount
     * @param currentSupply Current token supply
     * @param paymentAmount Payment amount (after fees)
     * @return tokens Tokens to mint
     */
    function _calculateTokensForPayment(
        uint256 currentSupply,
        uint256 paymentAmount
    ) internal pure returns (uint256 tokens) {
        // Solve for tokensToMint where calculateBuyPrice(supply, tokens) = payment
        // This is the inverse of the integral
        // payment = (2/3) * ((supply + tokens)^(3/2) - supply^(3/2))
        // (3/2) * payment = (supply + tokens)^(3/2) - supply^(3/2)
        // (supply + tokens)^(3/2) = (3/2) * payment + supply^(3/2)
        // supply + tokens = ((3/2) * payment + supply^(3/2))^(2/3)
        // tokens = ((3/2) * payment + supply^(3/2))^(2/3) - supply

        uint256 supply3_2 = _sqrt(currentSupply * currentSupply * currentSupply);
        uint256 term = (3 * paymentAmount) / 2 + supply3_2;

        // Calculate term^(2/3) = (term^2)^(1/3)
        uint256 newSupply3_2 = term;
        uint256 newSupply = _cbrt(newSupply3_2 * newSupply3_2);

        if (newSupply > currentSupply) {
            tokens = newSupply - currentSupply;
        } else {
            tokens = 0;
        }
    }

    /**
     * @dev Transfer payment (ETH or ERC20)
     */
    function _transferPayment(address token, address to, uint256 amount) internal {
        if (amount == 0) return;

        if (token == address(0)) {
            // ETH transfer
            (bool success, ) = to.call{value: amount}("");
            if (!success) revert ETHTransferFailed();
        } else {
            // ERC20 transfer
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /**
     * @dev Integer square root using Babylonian method
     */
    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;

        uint256 z = (x + 1) / 2;
        uint256 y = x;

        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }

        return y;
    }

    /**
     * @dev Integer cube root using Newton's method
     */
    function _cbrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;

        uint256 z = x;
        uint256 y;

        // Initial guess
        if (x >= 0x1000000000000000000000000) {
            z = x / 0x1000000000000000000;
            y = _cbrtHelper(z);
            return y * 1000000;
        } else if (x >= 0x1000000000000) {
            z = x / 0x1000000;
            y = _cbrtHelper(z);
            return y * 100;
        }

        return _cbrtHelper(x);
    }

    function _cbrtHelper(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;

        uint256 y = x;
        uint256 z = (x + 2) / 3;

        while (z < y) {
            y = z;
            z = (2 * z + x / (z * z)) / 3;
        }

        return y;
    }

    /**
     * @dev Convert uint64 to string
     */
    function _uint64ToString(uint64 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }

        uint64 temp = value;
        uint256 digits;

        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);

        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }

        return string(buffer);
    }

    /**
     * @dev Receive ETH (needed for settlement returns)
     */
    receive() external payable {}
}
