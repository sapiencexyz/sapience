// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/IParlayPool.sol";
import "./interfaces/IParlayStructs.sol";
import "./interfaces/IParlayPoolResolver.sol";
import "./interfaces/IParlayEvents.sol";
import "./utils/SignatureProcessor.sol";
import "../market/interfaces/ISapience.sol";
import "../market/interfaces/ISapienceStructs.sol";

// TODO rename to PredictionMarket, and parlays to prediction
/**
 * @title ParlayPool
 * @notice Implementation of the Parlay Pool contract with orderbook functionality
 */
contract ParlayPool is
    ERC721,
    IParlayPool,
    ReentrancyGuard,
    SignatureProcessor
{
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;
    // ============ State Variables ============

    IParlayStructs.Settings public config;

    uint256 private _parlayIdCounter; // Single ID for both requests and parlays
    uint256 private _nftTokenIdCounter; // Single counter for both maker and taker NFTs

    // Mapping to store mint parlay data by requestId
    mapping(uint256 => MintParlayRequestData) private mintParlayDataByRequestId; // requestId => MintParlayData

    mapping(uint256 => IParlayStructs.ParlayData) public parlays; // parlayId => ParlayData
    mapping(uint256 => IParlayStructs.PredictedOutcome[])
        public parlayPredictedOutcomes;

    mapping(uint256 => uint256) public nftToParlayId; // nftTokenId => parlayId
    mapping(uint256 => bool) public nftIsMaker; // flags if the nft is the maker (true) or taker (false)

    // Auxiliary mappings to track all nft by maker and taker
    mapping(address => EnumerableSet.UintSet) private nftByMakerAddress;
    mapping(address => EnumerableSet.UintSet) private nftByTakerAddress;

    // Auxiliary mapping to track approved takers
    mapping(address => bool) private approvedTakers;

    // ============ Constructor ============

    constructor(
        string memory name,
        string memory symbol,
        address _collateralToken,
        uint256 _maxParlayMarkets,
        uint256 _minCollateral,
        uint256 _minRequestExpirationTime,
        uint256 _maxRequestExpirationTime,
        address[] memory _approvedTakers
    ) ERC721(name, symbol) {
        require(_collateralToken != address(0), "Invalid collateral token");
        require(_minCollateral > 0, "Invalid min collateral");
        require(
            _maxRequestExpirationTime > _minRequestExpirationTime,
            "Invalid max expiration time"
        );

        config = IParlayStructs.Settings({
            collateralToken: _collateralToken,
            maxParlayMarkets: _maxParlayMarkets,
            minCollateral: _minCollateral,
            minRequestExpirationTime: _minRequestExpirationTime,
            maxRequestExpirationTime: _maxRequestExpirationTime,
            approvedTakers: _approvedTakers
        });

        for (uint256 i = 0; i < _approvedTakers.length; i++) {
            approvedTakers[_approvedTakers[i]] = true;
        }

        _parlayIdCounter = 0;
        _nftTokenIdCounter = 0;
    }

    function mint(
        MintParlayRequestData calldata mintParlayRequestData
    ) external nonReentrant returns (uint256 makerNftTokenId, uint256 takerNftTokenId) {
        require(mintParlayRequestData.maker == msg.sender, "Maker is not the caller");

        // 1- Initial checks
        require(
            mintParlayRequestData.predictedOutcomes.length > 0,
            "Must have at least one market"
        );
        require(
            mintParlayRequestData.predictedOutcomes.length <=
                config.maxParlayMarkets,
            "Too many markets"
        );
        require(
            mintParlayRequestData.makerCollateral >= config.minCollateral,
            "Collateral below minimum"
        );
        require(
            mintParlayRequestData.makerCollateral > 0,
            "Maker collateral must be greater than 0"
        );
        require(
            mintParlayRequestData.takerCollateral > 0,
            "Taker collateral must be greater than 0"
        );

        // Check if the signature of the taker is valid for this parlay (hash of predicted outcomes, taker collateral and maker collateral, resolver and maker address)
        bytes32 messageHash = keccak256(
            abi.encode(
                mintParlayRequestData.predictedOutcomes,
                mintParlayRequestData.takerCollateral,
                mintParlayRequestData.makerCollateral,
                mintParlayRequestData.resolver,
                mintParlayRequestData.maker
            )
        );

        if (!_isApprovalValid(
            messageHash,
            mintParlayRequestData.taker,
            mintParlayRequestData.takerParlaySignature
        )) {
            revert("Invalid taker signature");
        }

        // 2- Store parlay request data  (only if we are on a async mode)
        uint256 requestId = _parlayIdCounter++;
        mintParlayDataByRequestId[requestId] = mintParlayRequestData;

        // 3- Ask resolver if markets are OK
        (bool isValid,) = IParlayPoolResolver(
            mintParlayRequestData.resolver
        ).validateParlayMarkets(
                mintParlayRequestData.predictedOutcomes
            );

        require(isValid, "Invalid markets according to resolver");

        // 6- Set the parlay data
        makerNftTokenId = _nftTokenIdCounter++;
        takerNftTokenId = _nftTokenIdCounter++;
        parlays[requestId] = IParlayStructs.ParlayData({
            parlayId: requestId,
            resolver: mintParlayRequestData.resolver,
            maker: mintParlayRequestData.maker,
            taker: mintParlayRequestData.taker,
            filled: true,
            makerNftTokenId: makerNftTokenId,
            takerNftTokenId: takerNftTokenId,
            collateral: mintParlayRequestData.makerCollateral,
            payout: mintParlayRequestData.makerCollateral +
                mintParlayRequestData.takerCollateral,
            createdAt: block.timestamp,
            orderExpirationTime: block.timestamp, // maintained in the struct for compatibility
            settled: false,
            makerWon: false
        });

        // 7- Collact collateral
        // Approve collateral token for both maker and taker using the signatures

        // USE ERC20 PERMIT TO GET THE APPROVALS
        _callPermit(
            config.collateralToken,
            mintParlayRequestData.maker,
            mintParlayRequestData.makerCollateral,
            mintParlayRequestData.makerSignatureDeadline,
            mintParlayRequestData.makerSignature
        );
        _callPermit(
            config.collateralToken,
            mintParlayRequestData.taker,
            mintParlayRequestData.takerCollateral,
            mintParlayRequestData.takerSignatureDeadline,
            mintParlayRequestData.takerSignature
        );

        IERC20(config.collateralToken).safeTransferFrom(
            mintParlayRequestData.maker,
            address(this),
            mintParlayRequestData.makerCollateral
        );
        IERC20(config.collateralToken).safeTransferFrom(
            mintParlayRequestData.taker,
            address(this),
            mintParlayRequestData.takerCollateral
        );

        // 8- Mint NFTs and set parlay
        _safeMint(mintParlayRequestData.maker, makerNftTokenId);
        _safeMint(mintParlayRequestData.taker, takerNftTokenId);

        return (makerNftTokenId, takerNftTokenId);
    }

    function burn(uint256 tokenId) external nonReentrant {
        uint256 parlayId = nftToParlayId[tokenId];
        // 1- Get parlay from Store
        IParlayStructs.ParlayData memory parlay = parlays[parlayId];

        // 2- Initial checks
        require(parlay.maker != address(0), "Parlay not found");
        require(parlay.taker != address(0), "Parlay not found");
        require(parlay.filled, "Parlay not filled");

        // 3- Ask resolver if markets are settled, and if parlay succeeded or not, it means maker won
        (bool isValid, , bool makerWon) = IParlayPoolResolver(parlay.resolver)
            .resolveParlay(parlayPredictedOutcomes[parlayId]);

        require(isValid, "Parlay resolution failed");

        // 5- Send collateral to winner
        if (makerWon) {
            IERC20(config.collateralToken).safeTransfer(
                parlay.maker,
                parlay.payout
            );
        } else {
            IERC20(config.collateralToken).safeTransfer(
                parlay.taker,
                parlay.payout
            );
        }

        // 6- Set the parlay state (identify who won and set as closed)
        parlay.settled = true;
        parlay.makerWon = makerWon;

        // 7- Burn NFTs
        _burn(parlay.makerNftTokenId);
        _burn(parlay.takerNftTokenId);
    }

    // ============ Parlay Consolidation (pre-close) ============
    function consolidateParlay(uint256 tokenId) external nonReentrant {
        // 1- Get parlay from store
        IParlayStructs.ParlayData memory parlay = parlays[tokenId];
        // 2- Initial checks
        require(parlay.maker != address(0), "Parlay not found");
        require(parlay.taker != address(0), "Parlay not found");

        require(
            parlay.maker == parlay.taker,
            "Maker and taker are different. Cannot consolidate"
        );

        // 3- Set as settled and maker won and send the collateral to the maker
        parlay.settled = true;
        parlay.makerWon = true;
        IERC20(config.collateralToken).safeTransfer(
            parlay.maker,
            parlay.payout
        );

        // 4- Burn NFTs
        _burn(parlay.makerNftTokenId);
        _burn(parlay.takerNftTokenId);
    }

    // ============ View Functions ============

    function getConfig()
        external
        view
        returns (IParlayStructs.Settings memory)
    {
        return config;
    }

    function getParlay(
        uint256 tokenId
    )
        external
        view
        returns (
            IParlayStructs.ParlayData memory parlayData,
            IParlayStructs.PredictedOutcome[] memory predictedOutcomes
        )
    {
        uint256 parlayId = nftToParlayId[tokenId];
        require(parlayId != 0 && _isParlay(parlayId), "Parlay does not exist");

        parlayData = parlays[parlayId];
        predictedOutcomes = parlayPredictedOutcomes[parlayId];
    }

    /**
     * @notice Get all NFT IDs where `account` is the maker or taker
     * @dev Includes both unfilled and filled orders. Canceled orders are excluded (maker reset to address(0)).
     * @param account Address to filter by
     */
    function getOwnedPredictions(
        address account
    ) external view returns (uint256[] memory nftTokenIds) {
        // Get all nft by maker
        uint256[] memory makerNftTokenIds = nftByMakerAddress[account].values();
        uint256 makerNftTokenIdsLength = makerNftTokenIds.length;

        // Get all nft by taker
        uint256[] memory takerNftTokenIds = nftByTakerAddress[account].values();
        uint256 takerNftTokenIdsLength = takerNftTokenIds.length;

        uint256 totalCount = makerNftTokenIdsLength + takerNftTokenIdsLength;
        nftTokenIds = new uint256[](totalCount);

        for (uint256 i = 0; i < totalCount; i++) {
            nftTokenIds[i] = i < makerNftTokenIdsLength
                ? makerNftTokenIds[i]
                : takerNftTokenIds[i - makerNftTokenIdsLength];
        }
    }

    function getOwnedPredictionsCount(
        address account
    ) external view returns (uint256 count) {
        return nftByMakerAddress[account].length() + nftByTakerAddress[account].length();
    }

    // ============ Internal Functions ============

    function _isParlay(uint256 id) internal view returns (bool) {
        return
            parlays[id].maker != address(0) &&
            parlays[id].taker != address(0) ;
    }
}
