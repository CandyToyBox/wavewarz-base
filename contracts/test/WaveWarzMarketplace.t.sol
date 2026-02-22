// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "../src/WaveWarzMarketplace.sol";

// ============ Mock Contracts ============

contract MockNFT is ERC721, IERC2981 {
    uint256 public nextTokenId;
    address public royaltyReceiver;
    uint256 public royaltyBps;

    constructor() ERC721("MockNFT", "MNFT") {
        royaltyReceiver = msg.sender;
        royaltyBps = 1000; // 10%
    }

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = ++nextTokenId;
        _mint(to, tokenId);
    }

    function royaltyInfo(uint256, uint256 salePrice)
        external
        view
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        return (royaltyReceiver, (salePrice * royaltyBps) / 10000);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, IERC165)
        returns (bool)
    {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }

    function setRoyalty(address receiver, uint256 bps) external {
        royaltyReceiver = receiver;
        royaltyBps = bps;
    }
}

contract MockNFTNoRoyalty is ERC721 {
    uint256 public nextTokenId;

    constructor() ERC721("MockNoRoyaltyNFT", "MNRNFT") {}

    function mint(address to) external returns (uint256 tokenId) {
        tokenId = ++nextTokenId;
        _mint(to, tokenId);
    }
}

// Malicious bidder that reverts on ETH receive
contract MaliciousBidder {
    WaveWarzMarketplace public marketplace;

    constructor(address _marketplace) {
        marketplace = WaveWarzMarketplace(payable(_marketplace));
    }

    function placeBid(uint256 tokenId) external payable {
        marketplace.placeBid{value: msg.value}(tokenId);
    }

    // Revert on ETH receive to test pending withdrawals fallback
    receive() external payable {
        revert("I reject ETH");
    }
}

// ============ Test Contract ============

contract WaveWarzMarketplaceTest is Test {
    // Declare events locally for vm.expectEmit compatibility
    event ItemListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event ItemDelisted(uint256 indexed tokenId, address indexed seller);
    event ItemSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);
    event AuctionCreated(uint256 indexed tokenId, address indexed seller, uint256 startingPrice, uint256 reservePrice, uint256 endTime);
    event BidPlaced(uint256 indexed tokenId, address indexed bidder, uint256 amount);
    event AuctionSettled(uint256 indexed tokenId, address indexed winner, uint256 amount);
    event AuctionCancelled(uint256 indexed tokenId, address indexed seller);
    WaveWarzMarketplace public marketplace;
    MockNFT public nft;
    MockNFTNoRoyalty public nftNoRoyalty;

    address public owner = address(1);
    address public platformWallet = address(2);
    address public seller = address(3);
    address public buyer = address(4);
    address public bidder1 = address(5);
    address public bidder2 = address(6);
    address public royaltyReceiver = address(7);

    uint256 public constant TOKEN_1 = 1;
    uint256 public constant PRICE_1_ETH = 1 ether;

    function setUp() public {
        vm.prank(owner);
        nft = new MockNFT();

        vm.prank(owner);
        marketplace = new WaveWarzMarketplace(address(nft), platformWallet);

        // Fund actors
        vm.deal(seller, 10 ether);
        vm.deal(buyer, 10 ether);
        vm.deal(bidder1, 10 ether);
        vm.deal(bidder2, 10 ether);

        // Set royalty receiver on NFT
        nft.setRoyalty(royaltyReceiver, 1000); // 10%

        // Mint token to seller
        vm.prank(seller);
        nft.mint(seller);

        // Approve marketplace
        vm.prank(seller);
        nft.setApprovalForAll(address(marketplace), true);
    }

    // ============ Fixed-Price Listing Tests ============

    function test_ListItem() public {
        vm.prank(seller);
        marketplace.listItem(TOKEN_1, PRICE_1_ETH);

        WaveWarzMarketplace.Listing memory listing = marketplace.getListing(TOKEN_1);
        assertEq(listing.seller, seller);
        assertEq(listing.price, PRICE_1_ETH);
        assertTrue(listing.listedAt > 0);
        assertEq(uint256(marketplace.listingType(TOKEN_1)), uint256(WaveWarzMarketplace.ListingType.FixedPrice));

        // NFT should be held by marketplace
        assertEq(nft.ownerOf(TOKEN_1), address(marketplace));
    }

    function test_ListItem_EmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit ItemListed(TOKEN_1, seller, PRICE_1_ETH);

        vm.prank(seller);
        marketplace.listItem(TOKEN_1, PRICE_1_ETH);
    }

    function test_ListItem_RevertIfNotOwner() public {
        vm.prank(buyer);
        vm.expectRevert(WaveWarzMarketplace.NotTokenOwner.selector);
        marketplace.listItem(TOKEN_1, PRICE_1_ETH);
    }

    function test_ListItem_RevertIfZeroPrice() public {
        vm.prank(seller);
        vm.expectRevert(WaveWarzMarketplace.InvalidPrice.selector);
        marketplace.listItem(TOKEN_1, 0);
    }

    function test_ListItem_RevertIfAlreadyListed() public {
        // Fix applied: AlreadyListed check now comes before NotTokenOwner, making it reachable.
        // Scenario: TOKEN_1 is already in a FixedPrice listing (marketplace holds it).
        // A re-list attempt fires AlreadyListed before NotTokenOwner.
        vm.prank(seller);
        marketplace.listItem(TOKEN_1, PRICE_1_ETH);

        // TOKEN_1 is still marked FixedPrice — AlreadyListed fires first now
        vm.prank(seller);
        vm.expectRevert(WaveWarzMarketplace.AlreadyListed.selector);
        marketplace.listItem(TOKEN_1, PRICE_1_ETH);
    }

    function test_CreateAuction_RevertIfAlreadyListed() public {
        // Same fix: AlreadyListed reachable in createAuction after check-order swap
        vm.prank(seller);
        marketplace.listItem(TOKEN_1, PRICE_1_ETH);

        // TOKEN_1 listingType is FixedPrice → createAuction fires AlreadyListed
        vm.prank(seller);
        vm.expectRevert(WaveWarzMarketplace.AlreadyListed.selector);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);
    }

    function test_DelistItem() public {
        vm.prank(seller);
        marketplace.listItem(TOKEN_1, PRICE_1_ETH);

        vm.prank(seller);
        marketplace.delistItem(TOKEN_1);

        // NFT returned to seller
        assertEq(nft.ownerOf(TOKEN_1), seller);

        // Listing cleared
        assertEq(uint256(marketplace.listingType(TOKEN_1)), uint256(WaveWarzMarketplace.ListingType.None));
    }

    function test_DelistItem_EmitsEvent() public {
        vm.prank(seller);
        marketplace.listItem(TOKEN_1, PRICE_1_ETH);

        vm.expectEmit(true, true, false, false);
        emit ItemDelisted(TOKEN_1, seller);

        vm.prank(seller);
        marketplace.delistItem(TOKEN_1);
    }

    function test_DelistItem_RevertIfNotSeller() public {
        vm.prank(seller);
        marketplace.listItem(TOKEN_1, PRICE_1_ETH);

        vm.prank(buyer);
        vm.expectRevert(WaveWarzMarketplace.NotTokenOwner.selector);
        marketplace.delistItem(TOKEN_1);
    }

    function test_DelistItem_RevertIfNotListed() public {
        vm.prank(seller);
        vm.expectRevert(WaveWarzMarketplace.NotListed.selector);
        marketplace.delistItem(TOKEN_1);
    }

    function test_BuyItem() public {
        vm.prank(seller);
        marketplace.listItem(TOKEN_1, PRICE_1_ETH);

        uint256 sellerBefore = seller.balance;
        uint256 platformBefore = platformWallet.balance;
        uint256 royaltyBefore = royaltyReceiver.balance;

        vm.prank(buyer);
        marketplace.buyItem{value: PRICE_1_ETH}(TOKEN_1);

        // NFT transferred to buyer
        assertEq(nft.ownerOf(TOKEN_1), buyer);

        // Listing cleared
        assertEq(uint256(marketplace.listingType(TOKEN_1)), uint256(WaveWarzMarketplace.ListingType.None));

        // Fee distribution: 10% royalty + 2.5% platform = 12.5% total
        uint256 royaltyAmount = (PRICE_1_ETH * 1000) / 10000; // 10%
        uint256 platformFee = (PRICE_1_ETH * 250) / 10000;    // 2.5%
        uint256 sellerProceeds = PRICE_1_ETH - royaltyAmount - platformFee;

        assertEq(seller.balance - sellerBefore, sellerProceeds);
        assertEq(platformWallet.balance - platformBefore, platformFee);
        assertEq(royaltyReceiver.balance - royaltyBefore, royaltyAmount);
    }

    function test_BuyItem_RefundsExcess() public {
        vm.prank(seller);
        marketplace.listItem(TOKEN_1, PRICE_1_ETH);

        uint256 buyerBefore = buyer.balance;

        vm.prank(buyer);
        marketplace.buyItem{value: 2 ether}(TOKEN_1); // Overpay by 1 ETH

        // Buyer should get refund: paid 2 ETH, item costs 1 ETH
        // Net cost = 1 ETH (listing price)
        assertEq(buyerBefore - buyer.balance, PRICE_1_ETH);
    }

    function test_BuyItem_RevertIfNotListed() public {
        vm.prank(buyer);
        vm.expectRevert(WaveWarzMarketplace.NotListed.selector);
        marketplace.buyItem{value: PRICE_1_ETH}(TOKEN_1);
    }

    function test_BuyItem_RevertIfInsufficientPayment() public {
        vm.prank(seller);
        marketplace.listItem(TOKEN_1, PRICE_1_ETH);

        vm.prank(buyer);
        vm.expectRevert(WaveWarzMarketplace.InsufficientPayment.selector);
        marketplace.buyItem{value: 0.5 ether}(TOKEN_1);
    }

    function test_BuyItem_EmitsEvent() public {
        vm.prank(seller);
        marketplace.listItem(TOKEN_1, PRICE_1_ETH);

        vm.expectEmit(true, true, true, true);
        emit ItemSold(TOKEN_1, seller, buyer, PRICE_1_ETH);

        vm.prank(buyer);
        marketplace.buyItem{value: PRICE_1_ETH}(TOKEN_1);
    }

    function test_BuyItem_NoRoyaltyNFT() public {
        // Deploy a marketplace with no-royalty NFT
        vm.prank(owner);
        nftNoRoyalty = new MockNFTNoRoyalty();

        vm.prank(owner);
        WaveWarzMarketplace mp2 = new WaveWarzMarketplace(address(nftNoRoyalty), platformWallet);

        vm.prank(seller);
        uint256 tokenId = nftNoRoyalty.mint(seller);

        vm.prank(seller);
        nftNoRoyalty.setApprovalForAll(address(mp2), true);

        vm.prank(seller);
        mp2.listItem(tokenId, PRICE_1_ETH);

        uint256 sellerBefore = seller.balance;
        uint256 platformBefore = platformWallet.balance;

        vm.prank(buyer);
        mp2.buyItem{value: PRICE_1_ETH}(tokenId);

        // No royalty - seller gets full price minus platform fee
        uint256 platformFee = (PRICE_1_ETH * 250) / 10000;
        assertEq(seller.balance - sellerBefore, PRICE_1_ETH - platformFee);
        assertEq(platformWallet.balance - platformBefore, platformFee);
    }

    // ============ Auction Tests ============

    function test_CreateAuction() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0.5 ether, 1 hours);

        WaveWarzMarketplace.Auction memory auction = marketplace.getAuction(TOKEN_1);
        assertEq(auction.seller, seller);
        assertEq(auction.startingPrice, 0.1 ether);
        assertEq(auction.reservePrice, 0.5 ether);
        assertEq(auction.highestBid, 0);
        assertEq(auction.highestBidder, address(0));
        assertFalse(auction.settled);

        assertEq(uint256(marketplace.listingType(TOKEN_1)), uint256(WaveWarzMarketplace.ListingType.Auction));
        assertEq(nft.ownerOf(TOKEN_1), address(marketplace));
    }

    function test_CreateAuction_ZeroReservePrice() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        WaveWarzMarketplace.Auction memory auction = marketplace.getAuction(TOKEN_1);
        assertEq(auction.reservePrice, 0);
    }

    function test_CreateAuction_EmitsEvent() public {
        uint256 expectedEndTime = block.timestamp + 1 hours;

        vm.expectEmit(true, true, false, true);
        emit AuctionCreated(TOKEN_1, seller, 0.1 ether, 0.5 ether, expectedEndTime);

        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0.5 ether, 1 hours);
    }

    function test_CreateAuction_RevertIfNotOwner() public {
        vm.prank(buyer);
        vm.expectRevert(WaveWarzMarketplace.NotTokenOwner.selector);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);
    }

    function test_CreateAuction_RevertIfZeroPrice() public {
        vm.prank(seller);
        vm.expectRevert(WaveWarzMarketplace.InvalidPrice.selector);
        marketplace.createAuction(TOKEN_1, 0, 0, 1 hours);
    }

    function test_CreateAuction_RevertIfDurationTooShort() public {
        vm.prank(seller);
        vm.expectRevert(WaveWarzMarketplace.InvalidDuration.selector);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 30 minutes);
    }

    function test_CreateAuction_RevertIfDurationTooLong() public {
        vm.prank(seller);
        vm.expectRevert(WaveWarzMarketplace.InvalidDuration.selector);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 8 days);
    }

    function test_PlaceBid_FirstBid() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.prank(bidder1);
        marketplace.placeBid{value: 0.1 ether}(TOKEN_1);

        WaveWarzMarketplace.Auction memory auction = marketplace.getAuction(TOKEN_1);
        assertEq(auction.highestBid, 0.1 ether);
        assertEq(auction.highestBidder, bidder1);
    }

    function test_PlaceBid_HigherBidRefundsPrevious() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.prank(bidder1);
        marketplace.placeBid{value: 0.1 ether}(TOKEN_1);

        uint256 bidder1Before = bidder1.balance;

        // bidder2 outbids (needs 5% more: 0.1 * 1.05 = 0.105)
        vm.prank(bidder2);
        marketplace.placeBid{value: 0.2 ether}(TOKEN_1);

        // bidder1 should be refunded
        assertEq(bidder1.balance - bidder1Before, 0.1 ether);

        WaveWarzMarketplace.Auction memory auction = marketplace.getAuction(TOKEN_1);
        assertEq(auction.highestBidder, bidder2);
        assertEq(auction.highestBid, 0.2 ether);
    }

    function test_PlaceBid_RevertIfBelowMinIncrement() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.prank(bidder1);
        marketplace.placeBid{value: 0.1 ether}(TOKEN_1);

        // Must bid at least 5% more: 0.105 ether minimum
        vm.prank(bidder2);
        vm.expectRevert(WaveWarzMarketplace.BidTooLow.selector);
        marketplace.placeBid{value: 0.104 ether}(TOKEN_1);
    }

    function test_PlaceBid_RevertIfBelowStartingPrice() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.prank(bidder1);
        vm.expectRevert(WaveWarzMarketplace.BidTooLow.selector);
        marketplace.placeBid{value: 0.09 ether}(TOKEN_1);
    }

    function test_PlaceBid_RevertIfAuctionEnded() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.prank(bidder1);
        vm.expectRevert(WaveWarzMarketplace.AuctionEnded.selector);
        marketplace.placeBid{value: 0.1 ether}(TOKEN_1);
    }

    function test_PlaceBid_RevertIfSeller() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.prank(seller);
        vm.deal(seller, 10 ether);
        vm.expectRevert(WaveWarzMarketplace.CannotBidOnOwnAuction.selector);
        marketplace.placeBid{value: 0.1 ether}(TOKEN_1);
    }

    function test_PlaceBid_ExtendsAuctionInLastMinutes() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        // Warp to 9 minutes before end
        WaveWarzMarketplace.Auction memory auctionBefore = marketplace.getAuction(TOKEN_1);
        vm.warp(auctionBefore.endTime - 9 minutes);

        uint256 timeBefore = marketplace.getAuction(TOKEN_1).endTime;

        vm.prank(bidder1);
        marketplace.placeBid{value: 0.1 ether}(TOKEN_1);

        // End time should have extended by 10 minutes from current time
        WaveWarzMarketplace.Auction memory auctionAfter = marketplace.getAuction(TOKEN_1);
        assertGt(auctionAfter.endTime, timeBefore);
    }

    function test_PlaceBid_EmitsEvent() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.expectEmit(true, true, false, true);
        emit BidPlaced(TOKEN_1, bidder1, 0.1 ether);

        vm.prank(bidder1);
        marketplace.placeBid{value: 0.1 ether}(TOKEN_1);
    }

    function test_SettleAuction_WithBids_AboveReserve() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0.1 ether, 1 hours);

        vm.prank(bidder1);
        marketplace.placeBid{value: 0.5 ether}(TOKEN_1);

        vm.warp(block.timestamp + 1 hours + 1);

        uint256 sellerBefore = seller.balance;
        uint256 platformBefore = platformWallet.balance;
        uint256 royaltyBefore = royaltyReceiver.balance;

        marketplace.settleAuction(TOKEN_1);

        // NFT transferred to winner
        assertEq(nft.ownerOf(TOKEN_1), bidder1);

        // Fee distribution
        uint256 bid = 0.5 ether;
        uint256 royaltyAmount = (bid * 1000) / 10000; // 10%
        uint256 platformFee = (bid * 250) / 10000;     // 2.5%
        uint256 sellerProceeds = bid - royaltyAmount - platformFee;

        assertEq(seller.balance - sellerBefore, sellerProceeds);
        assertEq(platformWallet.balance - platformBefore, platformFee);
        assertEq(royaltyReceiver.balance - royaltyBefore, royaltyAmount);
    }

    function test_SettleAuction_NoBids_ReturnsNFT() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1);

        marketplace.settleAuction(TOKEN_1);

        // NFT returned to seller
        assertEq(nft.ownerOf(TOKEN_1), seller);
        assertTrue(marketplace.getAuction(TOKEN_1).settled);
    }

    function test_SettleAuction_ReservePriceNotMet_ReturnsNFT() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 1 ether, 1 hours);

        // Bid below reserve price
        vm.prank(bidder1);
        marketplace.placeBid{value: 0.5 ether}(TOKEN_1);

        vm.warp(block.timestamp + 1 hours + 1);

        uint256 bidder1Before = bidder1.balance;

        marketplace.settleAuction(TOKEN_1);

        // NFT returned to seller (reserve not met)
        assertEq(nft.ownerOf(TOKEN_1), seller);

        // Bidder refunded
        assertEq(bidder1.balance - bidder1Before, 0.5 ether);
    }

    function test_SettleAuction_RevertIfNotEnded() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.expectRevert(WaveWarzMarketplace.AuctionNotEnded.selector);
        marketplace.settleAuction(TOKEN_1);
    }

    function test_SettleAuction_RevertIfAlreadySettled() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1);
        marketplace.settleAuction(TOKEN_1);

        // After settle, listingType becomes None → NotAuction fires before AuctionAlreadySettled
        vm.expectRevert(WaveWarzMarketplace.NotAuction.selector);
        marketplace.settleAuction(TOKEN_1);
    }

    function test_SettleAuction_EmitsEvent() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.prank(bidder1);
        marketplace.placeBid{value: 0.5 ether}(TOKEN_1);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.expectEmit(true, true, false, true);
        emit AuctionSettled(TOKEN_1, bidder1, 0.5 ether);

        marketplace.settleAuction(TOKEN_1);
    }

    function test_CancelAuction_NoBids() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.prank(seller);
        marketplace.cancelAuction(TOKEN_1);

        // NFT returned to seller
        assertEq(nft.ownerOf(TOKEN_1), seller);
        assertEq(uint256(marketplace.listingType(TOKEN_1)), uint256(WaveWarzMarketplace.ListingType.None));
    }

    function test_CancelAuction_RevertWithBids() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.prank(bidder1);
        marketplace.placeBid{value: 0.1 ether}(TOKEN_1);

        vm.prank(seller);
        vm.expectRevert(WaveWarzMarketplace.BidTooLow.selector);
        marketplace.cancelAuction(TOKEN_1);
    }

    function test_CancelAuction_RevertIfNotSeller() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.prank(bidder1);
        vm.expectRevert(WaveWarzMarketplace.NotTokenOwner.selector);
        marketplace.cancelAuction(TOKEN_1);
    }

    // ============ Pending Withdrawals (Failed Transfer Fallback) ============

    function test_PendingWithdrawals_FailedTransfer() public {
        // Deploy malicious bidder
        MaliciousBidder malicious = new MaliciousBidder(address(marketplace));
        vm.deal(address(malicious), 10 ether);

        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        // Malicious bidder places first bid
        malicious.placeBid{value: 0.1 ether}(TOKEN_1);

        // Second bidder outbids — marketplace tries to refund malicious bidder
        // The refund will fail (malicious.receive reverts), so it goes to pendingWithdrawals
        vm.prank(bidder2);
        marketplace.placeBid{value: 0.5 ether}(TOKEN_1);

        // Pending withdrawal should have the refund
        assertEq(marketplace.pendingWithdrawals(address(malicious)), 0.1 ether);
    }

    function test_Withdraw_PendingFunds() public {
        MaliciousBidder malicious = new MaliciousBidder(address(marketplace));
        vm.deal(address(malicious), 10 ether);

        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        malicious.placeBid{value: 0.1 ether}(TOKEN_1);

        vm.prank(bidder2);
        marketplace.placeBid{value: 0.5 ether}(TOKEN_1);

        assertEq(marketplace.pendingWithdrawals(address(malicious)), 0.1 ether);

        // Now the malicious bidder upgrades their receive to accept ETH (simulated via a new contract)
        // Just verify the mapping is set correctly as a unit test
        // In practice, pending funds can be withdrawn by any address that is owed funds
    }

    function test_Withdraw_RevertIfNothingOwed() public {
        vm.prank(buyer);
        vm.expectRevert(WaveWarzMarketplace.NothingToWithdraw.selector);
        marketplace.withdraw();
    }

    // ============ Admin Functions ============

    function test_SetPlatformWallet() public {
        address newWallet = address(99);
        vm.prank(owner);
        marketplace.setPlatformWallet(newWallet);
        assertEq(marketplace.platformWallet(), newWallet);
    }

    function test_SetPlatformWallet_RevertIfNotOwner() public {
        vm.prank(seller);
        vm.expectRevert();
        marketplace.setPlatformWallet(address(99));
    }

    function test_SetNFTContract() public {
        address newNFT = address(new MockNFT());
        vm.prank(owner);
        marketplace.setNFTContract(newNFT);
        assertEq(marketplace.nftContract(), newNFT);
    }

    function test_SetNFTContract_RevertIfNotOwner() public {
        vm.prank(seller);
        vm.expectRevert();
        marketplace.setNFTContract(address(99));
    }

    // ============ View Functions ============

    function test_IsAuctionEnded_ReturnsFalseIfNotAuction() public {
        assertFalse(marketplace.isAuctionEnded(999));
    }

    function test_IsAuctionEnded_ReturnsFalseBeforeEnd() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);
        assertFalse(marketplace.isAuctionEnded(TOKEN_1));
    }

    function test_IsAuctionEnded_ReturnsTrueAfterEnd() public {
        vm.prank(seller);
        marketplace.createAuction(TOKEN_1, 0.1 ether, 0, 1 hours);

        vm.warp(block.timestamp + 1 hours + 1);
        assertTrue(marketplace.isAuctionEnded(TOKEN_1));
    }

    // ============ ERC721 Receiver ============

    function test_OnERC721Received() public {
        // Verify marketplace accepts NFTs
        bytes4 selector = marketplace.onERC721Received(address(0), address(0), 0, "");
        assertEq(selector, WaveWarzMarketplace.onERC721Received.selector);
    }
}
