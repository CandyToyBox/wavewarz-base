// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "../src/WaveWarzMarketplace.sol";
import "../src/WaveWarzMusicNFT.sol";

// ============ Helper Contracts ============

/// @dev Simulates a recipient that unconditionally refuses ETH — used to trigger
///      the pending-withdrawal fallback path in WaveWarzMarketplace._safeTransfer.
contract ETHRefuser {
    bool public refusing = true;

    function stopRefusing() external {
        refusing = false;
    }

    receive() external payable {
        require(!refusing, "ETH refused");
    }
}

/// @dev Attacker that attempts reentrancy during the bid-refund ETH callback.
contract BidReentrancyAttacker {
    WaveWarzMarketplace public immutable marketplace;
    uint256 public tokenId;
    bool public attacking;
    bool public reentrancySucceeded;

    constructor(address payable _marketplace) {
        marketplace = WaveWarzMarketplace(_marketplace);
    }

    function setup(uint256 _tokenId) external {
        tokenId = _tokenId;
    }

    function placeBid() external payable {
        attacking = true;
        marketplace.placeBid{value: msg.value}(tokenId);
    }

    receive() external payable {
        if (attacking) {
            attacking = false;
            // Try to reenter placeBid while the reentrancy guard is still active
            try marketplace.placeBid{value: msg.value}(tokenId) {
                reentrancySucceeded = true; // would be a vulnerability
            } catch {
                // correctly blocked
            }
        }
    }
}

// ============ Marketplace Test Contract ============

contract WaveWarzMarketplaceTest is Test {
    WaveWarzMarketplace public marketplace;
    WaveWarzMusicNFT public nft;

    address public platformWallet = makeAddr("platform");
    address public artist = makeAddr("artist");
    address public artist2 = makeAddr("artist2");
    address public buyer = makeAddr("buyer");
    address public buyer2 = makeAddr("buyer2");

    uint256 public constant NFT_PRICE = 1 ether;

    function setUp() public {
        // Deploy NFT contract — the test contract itself is the owner
        nft = new WaveWarzMusicNFT(platformWallet);

        // Verify artists
        nft.setArtistVerified(artist, true);
        nft.setArtistVerified(artist2, true);

        // Deploy marketplace
        marketplace = new WaveWarzMarketplace(address(nft), platformWallet);

        // Fund participants
        vm.deal(buyer, 100 ether);
        vm.deal(buyer2, 100 ether);
        vm.deal(artist, 10 ether);
        vm.deal(artist2, 10 ether);
    }

    // ============ Helper Functions ============

    function _mintNFT(address _artist) internal returns (uint256 tokenId) {
        vm.prank(_artist);
        tokenId = nft.mintMusicNFT(
            "Test Track",
            "Test Artist",
            "electronic",
            "https://example.com/track.mp3",
            180,
            1,
            "ipfs://QmTest"
        );
    }

    function _mintAndList(address _artist, uint256 price) internal returns (uint256 tokenId) {
        tokenId = _mintNFT(_artist);
        vm.prank(_artist);
        nft.approve(address(marketplace), tokenId);
        vm.prank(_artist);
        marketplace.listItem(tokenId, price);
    }

    function _mintAndCreateAuction(
        address _artist,
        uint256 startPrice,
        uint256 reservePrice,
        uint256 duration
    ) internal returns (uint256 tokenId) {
        tokenId = _mintNFT(_artist);
        vm.prank(_artist);
        nft.approve(address(marketplace), tokenId);
        vm.prank(_artist);
        marketplace.createAuction(tokenId, startPrice, reservePrice, duration);
    }

    // ============ Fixed-Price Listing ============

    function test_ListItem() public {
        uint256 tokenId = _mintNFT(artist);

        vm.prank(artist);
        nft.approve(address(marketplace), tokenId);

        vm.prank(artist);
        marketplace.listItem(tokenId, NFT_PRICE);

        WaveWarzMarketplace.Listing memory listing = marketplace.getListing(tokenId);
        assertEq(listing.seller, artist);
        assertEq(listing.price, NFT_PRICE);
        assertEq(uint256(marketplace.listingType(tokenId)), uint256(WaveWarzMarketplace.ListingType.FixedPrice));
        // NFT is now held by marketplace
        assertEq(nft.ownerOf(tokenId), address(marketplace));
    }

    function test_ListItemRevertsIfNotOwner() public {
        uint256 tokenId = _mintNFT(artist);

        vm.prank(buyer); // not the owner
        vm.expectRevert(WaveWarzMarketplace.NotTokenOwner.selector);
        marketplace.listItem(tokenId, NFT_PRICE);
    }

    function test_ListItemRevertsIfAlreadyListed() public {
        uint256 tokenId = _mintAndList(artist, NFT_PRICE);

        // Try to list again
        vm.prank(artist);
        vm.expectRevert(WaveWarzMarketplace.AlreadyListed.selector);
        marketplace.listItem(tokenId, NFT_PRICE);
    }

    function test_ListItemRevertsIfZeroPrice() public {
        uint256 tokenId = _mintNFT(artist);

        vm.prank(artist);
        nft.approve(address(marketplace), tokenId);

        vm.prank(artist);
        vm.expectRevert(WaveWarzMarketplace.InvalidPrice.selector);
        marketplace.listItem(tokenId, 0);
    }

    // ============ Delisting ============

    function test_DelistItem() public {
        uint256 tokenId = _mintAndList(artist, NFT_PRICE);

        vm.prank(artist);
        marketplace.delistItem(tokenId);

        assertEq(uint256(marketplace.listingType(tokenId)), uint256(WaveWarzMarketplace.ListingType.None));
        // NFT returned to seller
        assertEq(nft.ownerOf(tokenId), artist);
    }

    function test_DelistItemRevertsIfNotListed() public {
        uint256 tokenId = _mintNFT(artist);

        vm.prank(artist);
        vm.expectRevert(WaveWarzMarketplace.NotListed.selector);
        marketplace.delistItem(tokenId);
    }

    function test_DelistItemRevertsIfNotSeller() public {
        uint256 tokenId = _mintAndList(artist, NFT_PRICE);

        vm.prank(buyer); // not the seller
        vm.expectRevert(WaveWarzMarketplace.NotTokenOwner.selector);
        marketplace.delistItem(tokenId);
    }

    // ============ Buying at Fixed Price ============

    function test_BuyItem() public {
        uint256 tokenId = _mintAndList(artist, NFT_PRICE);

        uint256 artistBalBefore = artist.balance;
        uint256 platformBalBefore = platformWallet.balance;

        vm.prank(buyer);
        marketplace.buyItem{value: NFT_PRICE}(tokenId);

        // NFT transferred to buyer
        assertEq(nft.ownerOf(tokenId), buyer);

        // Royalty: 10% of price = 0.1 ether (goes to artist as royalty receiver)
        // Platform fee: 2.5% of price = 0.025 ether
        // Seller proceeds: 87.5% = 0.875 ether (artist is seller AND royalty receiver)
        uint256 royalty = (NFT_PRICE * 1000) / 10000; // 10%
        uint256 platformFee = (NFT_PRICE * 250) / 10000; // 2.5%
        uint256 sellerProceeds = NFT_PRICE - royalty - platformFee;

        // Artist receives seller proceeds + royalty (they're both seller and royalty receiver)
        assertEq(artist.balance - artistBalBefore, sellerProceeds + royalty);
        assertEq(platformWallet.balance - platformBalBefore, platformFee);
    }

    function test_BuyItemRevertsIfNotListed() public {
        uint256 tokenId = _mintNFT(artist);

        vm.prank(buyer);
        vm.expectRevert(WaveWarzMarketplace.NotListed.selector);
        marketplace.buyItem{value: NFT_PRICE}(tokenId);
    }

    function test_BuyItemRevertsIfUnderpaid() public {
        uint256 tokenId = _mintAndList(artist, NFT_PRICE);

        vm.prank(buyer);
        vm.expectRevert(WaveWarzMarketplace.InsufficientPayment.selector);
        marketplace.buyItem{value: NFT_PRICE - 1}(tokenId);
    }

    function test_BuyItemRefundsExcessPayment() public {
        uint256 tokenId = _mintAndList(artist, NFT_PRICE);

        uint256 balBefore = buyer.balance;
        uint256 overpay = 0.5 ether;

        vm.prank(buyer);
        marketplace.buyItem{value: NFT_PRICE + overpay}(tokenId);

        // Buyer should be refunded the overpay
        uint256 spent = balBefore - buyer.balance;
        assertEq(spent, NFT_PRICE, "Buyer should only spend exactly the listing price");
    }

    // ============ Auction Creation ============

    function test_CreateAuction() public {
        uint256 tokenId = _mintNFT(artist);
        vm.prank(artist);
        nft.approve(address(marketplace), tokenId);

        uint256 duration = 2 hours;
        vm.prank(artist);
        marketplace.createAuction(tokenId, 0.1 ether, 0.5 ether, duration);

        assertEq(uint256(marketplace.listingType(tokenId)), uint256(WaveWarzMarketplace.ListingType.Auction));
        // NFT transferred to marketplace
        assertEq(nft.ownerOf(tokenId), address(marketplace));
    }

    function test_CreateAuctionRevertsIfNotOwner() public {
        uint256 tokenId = _mintNFT(artist);

        vm.prank(buyer);
        vm.expectRevert(WaveWarzMarketplace.NotTokenOwner.selector);
        marketplace.createAuction(tokenId, 0.1 ether, 0, 2 hours);
    }

    function test_CreateAuctionRevertsIfDurationTooShort() public {
        uint256 tokenId = _mintNFT(artist);
        vm.prank(artist);
        nft.approve(address(marketplace), tokenId);

        vm.prank(artist);
        vm.expectRevert(WaveWarzMarketplace.InvalidDuration.selector);
        marketplace.createAuction(tokenId, 0.1 ether, 0, 30 minutes); // below MIN_AUCTION_DURATION
    }

    function test_CreateAuctionRevertsIfDurationTooLong() public {
        uint256 tokenId = _mintNFT(artist);
        vm.prank(artist);
        nft.approve(address(marketplace), tokenId);

        vm.prank(artist);
        vm.expectRevert(WaveWarzMarketplace.InvalidDuration.selector);
        marketplace.createAuction(tokenId, 0.1 ether, 0, 8 days); // above MAX_AUCTION_DURATION
    }

    function test_CreateAuctionRevertsIfAlreadyListed() public {
        uint256 tokenId = _mintAndList(artist, NFT_PRICE);

        // tokenId is already under a fixed-price listing (held by marketplace), can't create auction
        vm.prank(buyer);
        vm.expectRevert(WaveWarzMarketplace.NotTokenOwner.selector);
        marketplace.createAuction(tokenId, 0.1 ether, 0, 2 hours);
    }

    // ============ Placing Bids ============

    function test_PlaceBid() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.prank(buyer);
        marketplace.placeBid{value: 0.1 ether}(tokenId);

        WaveWarzMarketplace.Auction memory auction = marketplace.getAuction(tokenId);
        assertEq(auction.highestBid, 0.1 ether);
        assertEq(auction.highestBidder, buyer);
    }

    function test_PlaceBidRevertsIfBidTooLow() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.prank(buyer);
        marketplace.placeBid{value: 0.1 ether}(tokenId); // first bid

        // Second bid must be at least 5% higher
        vm.prank(buyer2);
        vm.expectRevert(WaveWarzMarketplace.BidTooLow.selector);
        marketplace.placeBid{value: 0.1 ether}(tokenId); // same amount — not enough increment
    }

    function test_PlaceBidRefundsPreviousBidder() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.prank(buyer);
        marketplace.placeBid{value: 0.1 ether}(tokenId);

        uint256 buyerBalBefore = buyer.balance;

        // Outbid by buyer2 (must be ≥ 5% more)
        uint256 newBid = 0.11 ether; // 10% more — satisfies 5% minimum increment
        vm.prank(buyer2);
        marketplace.placeBid{value: newBid}(tokenId);

        // buyer should have been refunded
        assertEq(buyer.balance, buyerBalBefore + 0.1 ether, "Previous bidder must be refunded");
    }

    function test_PlaceBidRevertsIfOwnAuction() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.prank(artist);
        vm.expectRevert(WaveWarzMarketplace.CannotBidOnOwnAuction.selector);
        marketplace.placeBid{value: 0.1 ether}(tokenId);
    }

    function test_PlaceBidRevertsAfterAuctionEnded() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.warp(block.timestamp + 2 hours + 1);

        vm.prank(buyer);
        vm.expectRevert(WaveWarzMarketplace.AuctionEnded.selector);
        marketplace.placeBid{value: 0.1 ether}(tokenId);
    }

    function test_PlaceBidRevertsOnNotAuction() public {
        uint256 tokenId = _mintAndList(artist, NFT_PRICE);

        vm.prank(buyer);
        vm.expectRevert(WaveWarzMarketplace.NotAuction.selector);
        marketplace.placeBid{value: NFT_PRICE}(tokenId);
    }

    // ============ Anti-Sniping Extension ============

    /**
     * @notice A bid placed within the last 10 minutes of an auction must extend
     *         the auction by 10 minutes from the time of the bid.
     */
    function test_AuctionExtendsWhenBidInLastTenMinutes() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        WaveWarzMarketplace.Auction memory auctionBefore = marketplace.getAuction(tokenId);
        uint256 endBefore = auctionBefore.endTime;

        // Warp to 5 minutes before end
        vm.warp(endBefore - 5 minutes);

        vm.prank(buyer);
        marketplace.placeBid{value: 0.1 ether}(tokenId);

        WaveWarzMarketplace.Auction memory auctionAfter = marketplace.getAuction(tokenId);
        assertGt(auctionAfter.endTime, endBefore, "Auction must extend when bid placed near end");
        assertEq(
            auctionAfter.endTime,
            block.timestamp + 10 minutes,
            "Auction end time must be extended by 10 minutes from bid time"
        );
    }

    /// @dev A bid placed with plenty of time remaining must NOT extend the auction.
    function test_AuctionDoesNotExtendIfPlentyOfTimeRemains() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        WaveWarzMarketplace.Auction memory auctionBefore = marketplace.getAuction(tokenId);
        uint256 endBefore = auctionBefore.endTime;

        // Warp to 30 minutes into the auction
        vm.warp(block.timestamp + 30 minutes);

        vm.prank(buyer);
        marketplace.placeBid{value: 0.1 ether}(tokenId);

        WaveWarzMarketplace.Auction memory auctionAfter = marketplace.getAuction(tokenId);
        assertEq(auctionAfter.endTime, endBefore, "Auction end time must not change for bids with plenty of time");
    }

    // ============ Settle Auction ============

    function test_SettleAuctionWithWinner() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.prank(buyer);
        marketplace.placeBid{value: 0.5 ether}(tokenId);

        vm.warp(block.timestamp + 2 hours + 1);

        uint256 artistBalBefore = artist.balance;
        uint256 platformBalBefore = platformWallet.balance;

        marketplace.settleAuction(tokenId);

        // Buyer wins the NFT
        assertEq(nft.ownerOf(tokenId), buyer);

        // Fee checks on winning bid (0.5 ether)
        uint256 royalty = (0.5 ether * 1000) / 10000; // 10%
        uint256 platformFee = (0.5 ether * 250) / 10000; // 2.5%
        uint256 sellerProceeds = 0.5 ether - royalty - platformFee;

        // Artist is seller AND royalty recipient
        assertEq(artist.balance - artistBalBefore, sellerProceeds + royalty);
        assertEq(platformWallet.balance - platformBalBefore, platformFee);
    }

    function test_SettleAuctionWithNoBidsReturnsNFTToSeller() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.warp(block.timestamp + 2 hours + 1);
        marketplace.settleAuction(tokenId);

        // NFT returned to artist
        assertEq(nft.ownerOf(tokenId), artist);
        assertEq(uint256(marketplace.listingType(tokenId)), uint256(WaveWarzMarketplace.ListingType.None));
    }

    function test_SettleAuctionReservePriceNotMet() public {
        uint256 reservePrice = 1 ether;
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, reservePrice, 2 hours);

        // Bid below reserve
        vm.prank(buyer);
        marketplace.placeBid{value: 0.5 ether}(tokenId);

        vm.warp(block.timestamp + 2 hours + 1);

        uint256 buyerBalBefore = buyer.balance;
        marketplace.settleAuction(tokenId);

        // NFT returned to artist — reserve not met
        assertEq(nft.ownerOf(tokenId), artist);
        // Buyer's bid refunded
        assertEq(buyer.balance, buyerBalBefore + 0.5 ether);
    }

    function test_SettleAuctionRevertsIfNotEnded() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.expectRevert(WaveWarzMarketplace.AuctionNotEnded.selector);
        marketplace.settleAuction(tokenId);
    }

    function test_SettleAuctionRevertsIfAlreadySettled() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.warp(block.timestamp + 2 hours + 1);
        marketplace.settleAuction(tokenId);

        vm.expectRevert(WaveWarzMarketplace.AuctionAlreadySettled.selector);
        marketplace.settleAuction(tokenId);
    }

    // ============ Cancel Auction ============

    function test_CancelAuctionWithNoBids() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.prank(artist);
        marketplace.cancelAuction(tokenId);

        // NFT returned
        assertEq(nft.ownerOf(tokenId), artist);
        assertEq(uint256(marketplace.listingType(tokenId)), uint256(WaveWarzMarketplace.ListingType.None));
    }

    function test_CancelAuctionRevertsIfHasBids() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.prank(buyer);
        marketplace.placeBid{value: 0.1 ether}(tokenId);

        vm.prank(artist);
        // The contract reuses BidTooLow as the error when an auction has active bids,
        // meaning cancellation is disallowed once any bid has been placed.
        vm.expectRevert(WaveWarzMarketplace.BidTooLow.selector);
        marketplace.cancelAuction(tokenId);
    }

    function test_CancelAuctionRevertsIfNotSeller() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.prank(buyer);
        vm.expectRevert(WaveWarzMarketplace.NotTokenOwner.selector);
        marketplace.cancelAuction(tokenId);
    }

    // ============ Pending Withdrawals (Failed ETH Transfer) ============

    /**
     * @notice When a recipient refuses ETH (e.g. smart-contract that reverts in receive()),
     *         the marketplace stores the funds in pendingWithdrawals instead of reverting.
     */
    function test_PendingWithdrawalWhenTransferFails() public {
        ETHRefuser refuser = new ETHRefuser();
        vm.deal(address(refuser), 1 ether);

        uint256 tokenId = _mintAndCreateAuction(artist2, 0.1 ether, 0, 2 hours);

        // Refuser places first bid
        vm.prank(address(refuser));
        marketplace.placeBid{value: 0.1 ether}(tokenId);

        // buyer outbids — marketplace tries to refund refuser, who refuses ETH
        uint256 outbid = 0.11 ether; // 10% more — satisfies 5% increment
        vm.prank(buyer);
        marketplace.placeBid{value: outbid}(tokenId);

        // Refuser's bid should now be in pendingWithdrawals (not lost)
        assertEq(marketplace.pendingWithdrawals(address(refuser)), 0.1 ether);
    }

    function test_WithdrawPendingFunds() public {
        // Set up a pending withdrawal: refuser bids, gets outbid, refund stored
        ETHRefuser refuser = new ETHRefuser();
        vm.deal(address(refuser), 1 ether);

        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.prank(address(refuser));
        marketplace.placeBid{value: 0.1 ether}(tokenId);

        vm.prank(buyer);
        marketplace.placeBid{value: 0.11 ether}(tokenId);

        assertEq(marketplace.pendingWithdrawals(address(refuser)), 0.1 ether);

        // Allow ETH on refuser so the withdrawal succeeds
        refuser.stopRefusing();

        vm.prank(address(refuser));
        marketplace.withdraw();

        assertEq(marketplace.pendingWithdrawals(address(refuser)), 0);
    }

    function test_WithdrawRevertsIfNothingPending() public {
        vm.prank(buyer);
        vm.expectRevert(WaveWarzMarketplace.NothingToWithdraw.selector);
        marketplace.withdraw();
    }

    // ============ Bid Minimum Increment ============

    function test_BidIncrementEnforced() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.prank(buyer);
        marketplace.placeBid{value: 0.1 ether}(tokenId);

        // Exactly 5% more should succeed (0.105 ether)
        uint256 minIncrement = (0.1 ether * 500) / 10000; // 5% = 0.005 ether
        uint256 minNextBid = 0.1 ether + minIncrement; // 0.105 ether

        vm.prank(buyer2);
        marketplace.placeBid{value: minNextBid}(tokenId);

        WaveWarzMarketplace.Auction memory auction = marketplace.getAuction(tokenId);
        assertEq(auction.highestBid, minNextBid);
        assertEq(auction.highestBidder, buyer2);
    }

    function test_BidOneLessWeiThanMinimumReverts() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        vm.prank(buyer);
        marketplace.placeBid{value: 0.1 ether}(tokenId);

        uint256 minIncrement = (0.1 ether * 500) / 10000;
        uint256 justUnder = 0.1 ether + minIncrement - 1;

        vm.prank(buyer2);
        vm.expectRevert(WaveWarzMarketplace.BidTooLow.selector);
        marketplace.placeBid{value: justUnder}(tokenId);
    }

    // ============ Admin Functions ============

    function test_SetPlatformWalletOnlyOwner() public {
        address newWallet = makeAddr("newPlatform");

        // Non-owner cannot update
        vm.prank(buyer);
        vm.expectRevert(); // Ownable: caller is not the owner
        marketplace.setPlatformWallet(newWallet);

        // Owner can update
        marketplace.setPlatformWallet(newWallet);
        assertEq(marketplace.platformWallet(), newWallet);
    }

    function test_SetNFTContractOnlyOwner() public {
        address newNFT = makeAddr("newNFT");

        vm.prank(buyer);
        vm.expectRevert(); // Ownable: caller is not the owner
        marketplace.setNFTContract(newNFT);

        marketplace.setNFTContract(newNFT);
        assertEq(marketplace.nftContract(), newNFT);
    }

    // ============ Reentrancy Protection ============

    /**
     * @notice A bidder contract that tries to reenter placeBid during the ETH
     *         refund callback must be blocked by the nonReentrant modifier.
     */
    function test_ReentrancyProtectionOnPlaceBid() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        BidReentrancyAttacker attacker = new BidReentrancyAttacker(payable(address(marketplace)));
        vm.deal(address(attacker), 10 ether);
        attacker.setup(tokenId);

        // Attacker places first bid
        attacker.placeBid{value: 0.1 ether}();

        // Out-bid the attacker from buyer2 — during refund, attacker's receive() fires
        // The receive() tries to place another bid; nonReentrant should block it.
        // Because attacker's bid is refunded via _safeTransfer (which catches reverts),
        // the reentrant attempt will simply fail and the refund will go to pendingWithdrawals.
        uint256 outbid = 0.11 ether;
        vm.prank(buyer2);
        marketplace.placeBid{value: outbid}(tokenId);

        assertFalse(attacker.reentrancySucceeded(), "Reentrancy must be blocked");
    }

    // ============ View Functions ============

    function test_IsAuctionEnded() public {
        uint256 tokenId = _mintAndCreateAuction(artist, 0.1 ether, 0, 2 hours);

        assertFalse(marketplace.isAuctionEnded(tokenId));

        vm.warp(block.timestamp + 2 hours + 1);
        assertTrue(marketplace.isAuctionEnded(tokenId));
    }

    function test_IsAuctionEndedReturnsFalseForNonAuction() public view {
        assertFalse(marketplace.isAuctionEnded(9999)); // non-existent token
    }

    // ============ Multiple NFTs / State Isolation ============

    /**
     * @notice Listing multiple NFTs must not interfere with each other.
     */
    function test_MultipleListingsAreIndependent() public {
        uint256 token0 = _mintAndList(artist, 1 ether);
        uint256 token1 = _mintAndList(artist2, 2 ether);

        WaveWarzMarketplace.Listing memory l0 = marketplace.getListing(token0);
        WaveWarzMarketplace.Listing memory l1 = marketplace.getListing(token1);

        assertEq(l0.seller, artist);
        assertEq(l0.price, 1 ether);
        assertEq(l1.seller, artist2);
        assertEq(l1.price, 2 ether);

        // Buy only token0
        vm.prank(buyer);
        marketplace.buyItem{value: 1 ether}(token0);

        assertEq(nft.ownerOf(token0), buyer);
        // token1 still listed
        assertEq(uint256(marketplace.listingType(token1)), uint256(WaveWarzMarketplace.ListingType.FixedPrice));
    }

    // ============ Platform Fee Constant ============

    function test_PlatformFeeConstant() public view {
        assertEq(marketplace.PLATFORM_FEE_BPS(), 250); // 2.5%
        assertEq(marketplace.BPS_DENOMINATOR(), 10000);
    }

    // ============ Fuzz: fee distribution never exceeds sale price ============

    function testFuzz_Marketplace_FeesNeverExceedSalePrice(uint256 price) public view {
        price = bound(price, 1, type(uint128).max);

        uint256 royalty = (price * 1000) / 10000; // 10% royalty
        uint256 platformFee = (price * marketplace.PLATFORM_FEE_BPS()) / marketplace.BPS_DENOMINATOR();

        assertLe(royalty + platformFee, price, "Fees must not exceed sale price");
    }
}
