// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title WaveWarzMarketplace
 * @notice NFT Marketplace for WaveWarz Music NFTs
 * @dev Supports fixed-price listings and English auctions with royalty enforcement
 */
contract WaveWarzMarketplace is IERC721Receiver, ReentrancyGuard, Ownable {
    // ============ Constants ============

    uint256 public constant PLATFORM_FEE_BPS = 250; // 2.5%
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant MIN_AUCTION_DURATION = 1 hours;
    uint256 public constant MAX_AUCTION_DURATION = 7 days;
    uint256 public constant MIN_BID_INCREMENT_BPS = 500; // 5% minimum bid increment

    // ============ State Variables ============

    address public platformWallet;
    address public nftContract;

    // Listing types
    enum ListingType { None, FixedPrice, Auction }

    // Fixed price listing
    struct Listing {
        address seller;
        uint256 price;
        uint256 listedAt;
    }

    // Auction
    struct Auction {
        address seller;
        uint256 startingPrice;
        uint256 reservePrice;
        uint256 highestBid;
        address highestBidder;
        uint256 startTime;
        uint256 endTime;
        bool settled;
    }

    // Mappings
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => ListingType) public listingType;

    // Pending withdrawals (for failed transfers)
    mapping(address => uint256) public pendingWithdrawals;

    // ============ Events ============

    event ItemListed(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 price
    );

    event ItemDelisted(uint256 indexed tokenId, address indexed seller);

    event ItemSold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price
    );

    event AuctionCreated(
        uint256 indexed tokenId,
        address indexed seller,
        uint256 startingPrice,
        uint256 reservePrice,
        uint256 endTime
    );

    event BidPlaced(
        uint256 indexed tokenId,
        address indexed bidder,
        uint256 amount
    );

    event AuctionSettled(
        uint256 indexed tokenId,
        address indexed winner,
        uint256 amount
    );

    event AuctionCancelled(uint256 indexed tokenId, address indexed seller);

    // ============ Errors ============

    error NotTokenOwner();
    error AlreadyListed();
    error NotListed();
    error InvalidPrice();
    error InvalidDuration();
    error InsufficientPayment();
    error AuctionNotEnded();
    error AuctionEnded();
    error AuctionAlreadySettled();
    error BidTooLow();
    error NoBidsPlaced();
    error CannotBidOnOwnAuction();
    error TransferFailed();
    error NothingToWithdraw();
    error InvalidNFTContract();
    error NotAuction();
    error ReservePriceNotMet();

    // ============ Constructor ============

    constructor(
        address _nftContract,
        address _platformWallet
    ) Ownable(msg.sender) {
        if (_nftContract == address(0)) revert InvalidNFTContract();
        nftContract = _nftContract;
        platformWallet = _platformWallet;
    }

    // ============ Fixed Price Listings ============

    /**
     * @notice List an NFT for fixed-price sale
     * @param tokenId Token ID to list
     * @param price Sale price in wei
     */
    function listItem(uint256 tokenId, uint256 price) external nonReentrant {
        IERC721 nft = IERC721(nftContract);

        if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (listingType[tokenId] != ListingType.None) revert AlreadyListed();
        if (price == 0) revert InvalidPrice();

        // Transfer NFT to marketplace
        nft.safeTransferFrom(msg.sender, address(this), tokenId);

        listings[tokenId] = Listing({
            seller: msg.sender,
            price: price,
            listedAt: block.timestamp
        });

        listingType[tokenId] = ListingType.FixedPrice;

        emit ItemListed(tokenId, msg.sender, price);
    }

    /**
     * @notice Remove a fixed-price listing
     * @param tokenId Token ID to delist
     */
    function delistItem(uint256 tokenId) external nonReentrant {
        if (listingType[tokenId] != ListingType.FixedPrice) revert NotListed();
        if (listings[tokenId].seller != msg.sender) revert NotTokenOwner();

        delete listings[tokenId];
        listingType[tokenId] = ListingType.None;

        // Return NFT to seller
        IERC721(nftContract).safeTransferFrom(address(this), msg.sender, tokenId);

        emit ItemDelisted(tokenId, msg.sender);
    }

    /**
     * @notice Buy a listed NFT at fixed price
     * @param tokenId Token ID to buy
     */
    function buyItem(uint256 tokenId) external payable nonReentrant {
        if (listingType[tokenId] != ListingType.FixedPrice) revert NotListed();

        Listing memory listing = listings[tokenId];
        if (msg.value < listing.price) revert InsufficientPayment();

        // Clear listing
        delete listings[tokenId];
        listingType[tokenId] = ListingType.None;

        // Calculate fees
        (address royaltyReceiver, uint256 royaltyAmount) = _getRoyaltyInfo(tokenId, listing.price);
        uint256 platformFee = (listing.price * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 sellerProceeds = listing.price - royaltyAmount - platformFee;

        // Transfer NFT to buyer
        IERC721(nftContract).safeTransferFrom(address(this), msg.sender, tokenId);

        // Distribute payments
        _safeTransfer(listing.seller, sellerProceeds);
        if (royaltyAmount > 0) {
            _safeTransfer(royaltyReceiver, royaltyAmount);
        }
        _safeTransfer(platformWallet, platformFee);

        // Refund excess payment
        if (msg.value > listing.price) {
            _safeTransfer(msg.sender, msg.value - listing.price);
        }

        emit ItemSold(tokenId, listing.seller, msg.sender, listing.price);
    }

    // ============ Auctions ============

    /**
     * @notice Create an auction for an NFT
     * @param tokenId Token ID to auction
     * @param startingPrice Starting bid price
     * @param reservePrice Minimum price to accept (can be 0)
     * @param duration Auction duration in seconds
     */
    function createAuction(
        uint256 tokenId,
        uint256 startingPrice,
        uint256 reservePrice,
        uint256 duration
    ) external nonReentrant {
        IERC721 nft = IERC721(nftContract);

        if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (listingType[tokenId] != ListingType.None) revert AlreadyListed();
        if (startingPrice == 0) revert InvalidPrice();
        if (duration < MIN_AUCTION_DURATION || duration > MAX_AUCTION_DURATION) {
            revert InvalidDuration();
        }

        // Transfer NFT to marketplace
        nft.safeTransferFrom(msg.sender, address(this), tokenId);

        auctions[tokenId] = Auction({
            seller: msg.sender,
            startingPrice: startingPrice,
            reservePrice: reservePrice,
            highestBid: 0,
            highestBidder: address(0),
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            settled: false
        });

        listingType[tokenId] = ListingType.Auction;

        emit AuctionCreated(tokenId, msg.sender, startingPrice, reservePrice, block.timestamp + duration);
    }

    /**
     * @notice Place a bid on an auction
     * @param tokenId Token ID to bid on
     */
    function placeBid(uint256 tokenId) external payable nonReentrant {
        if (listingType[tokenId] != ListingType.Auction) revert NotAuction();

        Auction storage auction = auctions[tokenId];

        if (block.timestamp >= auction.endTime) revert AuctionEnded();
        if (msg.sender == auction.seller) revert CannotBidOnOwnAuction();

        uint256 minBid;
        if (auction.highestBid == 0) {
            minBid = auction.startingPrice;
        } else {
            minBid = auction.highestBid + (auction.highestBid * MIN_BID_INCREMENT_BPS) / BPS_DENOMINATOR;
        }

        if (msg.value < minBid) revert BidTooLow();

        // Refund previous highest bidder
        if (auction.highestBidder != address(0)) {
            _safeTransfer(auction.highestBidder, auction.highestBid);
        }

        // Update auction state
        auction.highestBid = msg.value;
        auction.highestBidder = msg.sender;

        // Extend auction if bid placed in last 10 minutes
        if (auction.endTime - block.timestamp < 10 minutes) {
            auction.endTime = block.timestamp + 10 minutes;
        }

        emit BidPlaced(tokenId, msg.sender, msg.value);
    }

    /**
     * @notice Settle an ended auction
     * @param tokenId Token ID to settle
     */
    function settleAuction(uint256 tokenId) external nonReentrant {
        if (listingType[tokenId] != ListingType.Auction) revert NotAuction();

        Auction storage auction = auctions[tokenId];

        if (block.timestamp < auction.endTime) revert AuctionNotEnded();
        if (auction.settled) revert AuctionAlreadySettled();

        auction.settled = true;
        listingType[tokenId] = ListingType.None;

        // If no bids or reserve not met, return NFT to seller
        if (auction.highestBidder == address(0) ||
            (auction.reservePrice > 0 && auction.highestBid < auction.reservePrice)) {

            IERC721(nftContract).safeTransferFrom(address(this), auction.seller, tokenId);

            // Refund highest bidder if reserve not met
            if (auction.highestBidder != address(0)) {
                _safeTransfer(auction.highestBidder, auction.highestBid);
            }

            emit AuctionCancelled(tokenId, auction.seller);
            return;
        }

        // Calculate fees
        (address royaltyReceiver, uint256 royaltyAmount) = _getRoyaltyInfo(tokenId, auction.highestBid);
        uint256 platformFee = (auction.highestBid * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 sellerProceeds = auction.highestBid - royaltyAmount - platformFee;

        // Transfer NFT to winner
        IERC721(nftContract).safeTransferFrom(address(this), auction.highestBidder, tokenId);

        // Distribute payments
        _safeTransfer(auction.seller, sellerProceeds);
        if (royaltyAmount > 0) {
            _safeTransfer(royaltyReceiver, royaltyAmount);
        }
        _safeTransfer(platformWallet, platformFee);

        emit AuctionSettled(tokenId, auction.highestBidder, auction.highestBid);
    }

    /**
     * @notice Cancel an auction with no bids
     * @param tokenId Token ID
     */
    function cancelAuction(uint256 tokenId) external nonReentrant {
        if (listingType[tokenId] != ListingType.Auction) revert NotAuction();

        Auction storage auction = auctions[tokenId];

        if (auction.seller != msg.sender) revert NotTokenOwner();
        if (auction.highestBidder != address(0)) revert BidTooLow(); // Can't cancel with bids

        auction.settled = true;
        listingType[tokenId] = ListingType.None;

        // Return NFT to seller
        IERC721(nftContract).safeTransferFrom(address(this), msg.sender, tokenId);

        emit AuctionCancelled(tokenId, msg.sender);
    }

    // ============ View Functions ============

    /**
     * @notice Get listing details
     */
    function getListing(uint256 tokenId) external view returns (Listing memory) {
        return listings[tokenId];
    }

    /**
     * @notice Get auction details
     */
    function getAuction(uint256 tokenId) external view returns (Auction memory) {
        return auctions[tokenId];
    }

    /**
     * @notice Check if an auction has ended
     */
    function isAuctionEnded(uint256 tokenId) external view returns (bool) {
        if (listingType[tokenId] != ListingType.Auction) return false;
        return block.timestamp >= auctions[tokenId].endTime;
    }

    // ============ Admin Functions ============

    /**
     * @notice Update platform wallet
     */
    function setPlatformWallet(address newWallet) external onlyOwner {
        platformWallet = newWallet;
    }

    /**
     * @notice Update NFT contract (for emergencies only)
     */
    function setNFTContract(address newContract) external onlyOwner {
        nftContract = newContract;
    }

    // ============ Withdrawal ============

    /**
     * @notice Withdraw pending funds (from failed transfers)
     */
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pendingWithdrawals[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) {
            pendingWithdrawals[msg.sender] = amount;
            revert TransferFailed();
        }
    }

    // ============ Internal Functions ============

    function _getRoyaltyInfo(uint256 tokenId, uint256 salePrice)
        internal
        view
        returns (address receiver, uint256 amount)
    {
        try IERC2981(nftContract).royaltyInfo(tokenId, salePrice) returns (
            address _receiver,
            uint256 _amount
        ) {
            return (_receiver, _amount);
        } catch {
            return (address(0), 0);
        }
    }

    function _safeTransfer(address to, uint256 amount) internal {
        if (amount == 0) return;

        (bool success, ) = to.call{value: amount}("");
        if (!success) {
            // Store for later withdrawal if transfer fails
            pendingWithdrawals[to] += amount;
        }
    }

    // ============ ERC721 Receiver ============

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // ============ Receive ETH ============

    receive() external payable {}
}
