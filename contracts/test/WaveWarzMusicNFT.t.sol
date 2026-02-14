// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/WaveWarzMusicNFT.sol";

contract WaveWarzMusicNFTTest is Test {
    WaveWarzMusicNFT public nft;
    address public owner;
    address public artist;
    address public artist2;
    address public buyer;
    address public platformWallet;

    function setUp() public {
        owner = address(this);
        artist = makeAddr("artist");
        artist2 = makeAddr("artist2");
        buyer = makeAddr("buyer");
        platformWallet = makeAddr("platform");

        nft = new WaveWarzMusicNFT(platformWallet);

        // Verify artist
        nft.setArtistVerified(artist, true);

        vm.deal(buyer, 10 ether);
    }

    function test_MintMusicNFT() public {
        vm.prank(artist);
        uint256 tokenId = nft.mintMusicNFT(
            "Battle Anthem",
            "Test Artist",
            "hip-hop",
            "https://example.com/track.mp3",
            180,
            1001,
            "ipfs://QmTest"
        );

        assertEq(tokenId, 0);
        assertEq(nft.ownerOf(tokenId), artist);
        assertEq(nft.tokenURI(tokenId), "ipfs://QmTest");
    }

    function test_OnlyVerifiedCanMint() public {
        vm.prank(artist2); // not verified
        vm.expectRevert();
        nft.mintMusicNFT(
            "Unauthorized Track",
            "Unverified",
            "pop",
            "https://example.com/track.mp3",
            120,
            0,
            "ipfs://QmTest"
        );
    }

    function test_BatchVerify() public {
        address[] memory artists = new address[](2);
        artists[0] = artist;
        artists[1] = artist2;
        nft.setArtistsVerified(artists, true);

        // Both should be able to mint now
        vm.prank(artist2);
        uint256 tokenId = nft.mintMusicNFT(
            "Track 2",
            "Artist 2",
            "electronic",
            "https://example.com/track2.mp3",
            200,
            0,
            "ipfs://QmTest2"
        );
        assertEq(nft.ownerOf(tokenId), artist2);
    }

    function test_GetTokenMetadata() public {
        vm.prank(artist);
        uint256 tokenId = nft.mintMusicNFT(
            "My Song",
            "Cool Artist",
            "rap",
            "https://example.com/song.mp3",
            240,
            1002,
            "ipfs://QmMeta"
        );

        WaveWarzMusicNFT.MusicMetadata memory meta = nft.getTokenMetadata(tokenId);

        assertEq(meta.title, "My Song");
        assertEq(meta.artistName, "Cool Artist");
        assertEq(meta.genre, "rap");
        assertEq(meta.trackUrl, "https://example.com/song.mp3");
        assertEq(meta.duration, 240);
        assertEq(meta.battleId, 1002);
        assertGt(meta.mintedAt, 0);
    }

    function test_GetArtistTokens() public {
        vm.startPrank(artist);
        nft.mintMusicNFT("Track 1", "Artist", "pop", "https://a.com/1.mp3", 100, 0, "ipfs://1");
        nft.mintMusicNFT("Track 2", "Artist", "pop", "https://a.com/2.mp3", 100, 0, "ipfs://2");
        nft.mintMusicNFT("Track 3", "Artist", "pop", "https://a.com/3.mp3", 100, 0, "ipfs://3");
        vm.stopPrank();

        uint256[] memory tokens = nft.getArtistTokens(artist);
        assertEq(tokens.length, 3);
    }

    function test_Royalties() public {
        vm.prank(artist);
        uint256 tokenId = nft.mintMusicNFT(
            "Royalty Track",
            "Artist",
            "jazz",
            "https://a.com/royalty.mp3",
            180,
            0,
            "ipfs://royalty"
        );

        // Default royalty is 10% (1000 BPS)
        (address receiver, uint256 royaltyAmount) = nft.royaltyInfo(tokenId, 1 ether);
        assertEq(receiver, artist);
        assertEq(royaltyAmount, 0.1 ether); // 10%
    }

    function test_TotalSupply() public {
        assertEq(nft.totalSupply(), 0);

        vm.startPrank(artist);
        nft.mintMusicNFT("T1", "A", "g", "https://a.com/1.mp3", 60, 0, "ipfs://1");
        nft.mintMusicNFT("T2", "A", "g", "https://a.com/2.mp3", 60, 0, "ipfs://2");
        vm.stopPrank();

        assertEq(nft.totalSupply(), 2);
    }
}
