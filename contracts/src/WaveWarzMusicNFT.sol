// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title WaveWarzMusicNFT
 * @notice ERC721 NFT contract for AI-generated music on WaveWarz Base
 * @dev Supports royalties (EIP-2981) for secondary sales
 */
contract WaveWarzMusicNFT is ERC721, ERC721URIStorage, ERC721Royalty, Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    // Platform fee for minting (in basis points)
    uint256 public constant MINT_FEE_BPS = 250; // 2.5%
    uint256 public constant BPS_DENOMINATOR = 10000;

    // Default royalty for artists (in basis points)
    uint96 public constant DEFAULT_ROYALTY_BPS = 1000; // 10%

    // Platform wallet for fees
    address public platformWallet;

    // Mapping from token ID to artist wallet
    mapping(uint256 => address) public tokenArtist;

    // Mapping from artist to their minted tokens
    mapping(address => uint256[]) public artistTokens;

    // Verified artists (Moltbook verified)
    mapping(address => bool) public verifiedArtists;

    // Token metadata
    struct MusicMetadata {
        string title;
        string artistName;
        string genre;
        string trackUrl;
        uint256 duration; // in seconds
        uint256 battleId; // 0 if not from a battle
        uint256 mintedAt;
    }

    mapping(uint256 => MusicMetadata) public tokenMetadata;

    // Events
    event ArtistVerified(address indexed artist, bool verified);
    event MusicNFTMinted(
        uint256 indexed tokenId,
        address indexed artist,
        string title,
        string trackUrl
    );
    event PlatformWalletUpdated(address indexed oldWallet, address indexed newWallet);

    // Errors
    error NotVerifiedArtist();
    error InvalidMintFee();
    error InvalidRoyalty();
    error TransferFailed();

    constructor(
        address _platformWallet
    ) ERC721("WaveWarz Music", "WWMUSIC") Ownable(msg.sender) {
        platformWallet = _platformWallet;
    }

    /**
     * @notice Verify an artist (only owner can do this)
     * @param artist Artist wallet address
     * @param verified Whether artist is verified
     */
    function setArtistVerified(address artist, bool verified) external onlyOwner {
        verifiedArtists[artist] = verified;
        emit ArtistVerified(artist, verified);
    }

    /**
     * @notice Batch verify artists
     * @param artists Array of artist addresses
     * @param verified Whether artists are verified
     */
    function setArtistsVerified(address[] calldata artists, bool verified) external onlyOwner {
        for (uint256 i = 0; i < artists.length; i++) {
            verifiedArtists[artists[i]] = verified;
            emit ArtistVerified(artists[i], verified);
        }
    }

    /**
     * @notice Mint a new music NFT
     * @param title Track title
     * @param artistName Artist display name
     * @param genre Music genre
     * @param trackUrl URL to the audio file
     * @param duration Track duration in seconds
     * @param battleId Battle ID if from a battle, 0 otherwise
     * @param metadataURI Token metadata URI (IPFS or similar)
     */
    function mintMusicNFT(
        string calldata title,
        string calldata artistName,
        string calldata genre,
        string calldata trackUrl,
        uint256 duration,
        uint256 battleId,
        string calldata metadataURI
    ) external payable returns (uint256) {
        if (!verifiedArtists[msg.sender]) revert NotVerifiedArtist();

        // Calculate and verify mint fee
        // For simplicity, we use a flat fee model here
        // In production, this could be dynamic based on rarity/features

        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();

        // Mint the NFT
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, metadataURI);

        // Set royalty for this token (artist receives royalties on secondary sales)
        _setTokenRoyalty(tokenId, msg.sender, DEFAULT_ROYALTY_BPS);

        // Store metadata
        tokenMetadata[tokenId] = MusicMetadata({
            title: title,
            artistName: artistName,
            genre: genre,
            trackUrl: trackUrl,
            duration: duration,
            battleId: battleId,
            mintedAt: block.timestamp
        });

        // Track artist's tokens
        tokenArtist[tokenId] = msg.sender;
        artistTokens[msg.sender].push(tokenId);

        // Transfer any ETH sent to platform (optional tip/fee)
        if (msg.value > 0) {
            (bool success, ) = platformWallet.call{value: msg.value}("");
            if (!success) revert TransferFailed();
        }

        emit MusicNFTMinted(tokenId, msg.sender, title, trackUrl);

        return tokenId;
    }

    /**
     * @notice Get all tokens minted by an artist
     * @param artist Artist wallet address
     * @return Array of token IDs
     */
    function getArtistTokens(address artist) external view returns (uint256[] memory) {
        return artistTokens[artist];
    }

    /**
     * @notice Get token metadata
     * @param tokenId Token ID
     * @return MusicMetadata struct
     */
    function getTokenMetadata(uint256 tokenId) external view returns (MusicMetadata memory) {
        return tokenMetadata[tokenId];
    }

    /**
     * @notice Get total supply of minted NFTs
     */
    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter.current();
    }

    /**
     * @notice Update platform wallet
     * @param newWallet New platform wallet address
     */
    function setPlatformWallet(address newWallet) external onlyOwner {
        address oldWallet = platformWallet;
        platformWallet = newWallet;
        emit PlatformWalletUpdated(oldWallet, newWallet);
    }

    // ============ Overrides ============

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, ERC721Royalty)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage, ERC721Royalty) {
        super._burn(tokenId);
    }
}
