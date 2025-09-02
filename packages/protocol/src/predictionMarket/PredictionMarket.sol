// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/IPredictionMarket.sol";
import "./interfaces/IPredictionStructs.sol";
import "./interfaces/IPredictionMarketResolver.sol";
import "./interfaces/IPredictionEvents.sol";
import "./utils/SignatureProcessor.sol";
import "../market/interfaces/ISapience.sol";
import "../market/interfaces/ISapienceStructs.sol";

/**
 * @title PredictionMarket
 * @notice Implementation of the Prediction Market contract with orderbook functionality
 */
contract PredictionMarket is
    ERC721,
    IPredictionMarket,
    ReentrancyGuard,
    SignatureProcessor
{
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;

    // ============ State Variables ============
    IPredictionStructs.Settings public config;

    // ============ Counters ============
    uint256 private _predictionIdCounter; // Single ID for both requests and predictions
    uint256 private _nftTokenIdCounter; // Single counter for both maker and taker NFTs

    // ============ Mappings ============
    mapping(uint256 => IPredictionStructs.PredictionData) private predictions;

    mapping(uint256 => uint256) private nftToPredictionId; // nftTokenId => predictionId

    // Auxiliary mappings to track all nft by maker and taker
    mapping(address => EnumerableSet.UintSet) private nftByMakerAddress;
    mapping(address => EnumerableSet.UintSet) private nftByTakerAddress;

    // ============ Constructor ============

    constructor(
        string memory name,
        string memory symbol,
        address _collateralToken,
        uint256 _maxPredictionMarkets,
        uint256 _minCollateral,
        uint256 _minRequestExpirationTime,
        uint256 _maxRequestExpirationTime
    ) ERC721(name, symbol) {
        require(_collateralToken != address(0), "Invalid collateral token");
        require(_minCollateral > 0, "Invalid min collateral");
        require(
            _maxRequestExpirationTime > _minRequestExpirationTime,
            "Invalid max expiration time"
        );

        config = IPredictionStructs.Settings({
            collateralToken: _collateralToken,
            maxPredictionMarkets: _maxPredictionMarkets,
            minCollateral: _minCollateral,
            minRequestExpirationTime: _minRequestExpirationTime,
            maxRequestExpirationTime: _maxRequestExpirationTime
        });

        _predictionIdCounter = 0;
        _nftTokenIdCounter = 0;
    }

    function mint(
        IPredictionStructs.MintPredictionRequestData calldata mintPredictionRequestData
    ) external nonReentrant returns (uint256 makerNftTokenId, uint256 takerNftTokenId) {
        // 1- Initial checks
        require(mintPredictionRequestData.maker == msg.sender, "Maker is not the caller");

        require(
            mintPredictionRequestData.makerCollateral >= config.minCollateral,
            "Collateral below minimum"
        );
        require(
            mintPredictionRequestData.makerCollateral > 0,
            "Maker collateral must be greater than 0"
        );
        require(
            mintPredictionRequestData.takerCollateral > 0,
            "Taker collateral must be greater than 0"
        );

        // 2- Confirm the taker signature is valid for this prediction (hash of predicted outcomes, taker collateral and maker collateral, resolver and maker address)
        bytes32 messageHash = keccak256(
            abi.encode(
                mintPredictionRequestData.encodedPredictedOutcomes,
                mintPredictionRequestData.takerCollateral,
                mintPredictionRequestData.makerCollateral,
                mintPredictionRequestData.resolver,
                mintPredictionRequestData.maker
            )
        );

        if (!_isApprovalValid(
            messageHash,
            mintPredictionRequestData.taker,
            mintPredictionRequestData.takerPredictionSignature
        )) {
            revert("Invalid taker signature");
        }

        // 3- Ask resolver if markets are OK
        (bool isValid,) = IPredictionMarketResolver(
            mintPredictionRequestData.resolver
        ).validatePredictionMarkets(
                mintPredictionRequestData.encodedPredictedOutcomes
            );

        require(isValid, "Invalid markets according to resolver");

        // 4- Set the prediction data
        uint256 predictionId = _predictionIdCounter++;

        makerNftTokenId = _nftTokenIdCounter++;
        takerNftTokenId = _nftTokenIdCounter++;
        predictions[predictionId] = IPredictionStructs.PredictionData({
            encodedPredictedOutcomes: mintPredictionRequestData.encodedPredictedOutcomes,
            predictionId: predictionId,
            resolver: mintPredictionRequestData.resolver,
            maker: mintPredictionRequestData.maker,
            taker: mintPredictionRequestData.taker,
            makerNftTokenId: makerNftTokenId,
            takerNftTokenId: takerNftTokenId,
            makerCollateral: mintPredictionRequestData.makerCollateral,
            takerCollateral: mintPredictionRequestData.takerCollateral,
            settled: false,
            makerWon: false
        });

        // 5- Collact collateral
        _callPermit(
            config.collateralToken,
            mintPredictionRequestData.maker,
            mintPredictionRequestData.makerCollateral,
            mintPredictionRequestData.makerSignatureDeadline,
            mintPredictionRequestData.makerSignature
        );
        _callPermit(
            config.collateralToken,
            mintPredictionRequestData.taker,
            mintPredictionRequestData.takerCollateral,
            mintPredictionRequestData.takerSignatureDeadline,
            mintPredictionRequestData.takerSignature
        );

        IERC20(config.collateralToken).safeTransferFrom(
            mintPredictionRequestData.maker,
            address(this),
            mintPredictionRequestData.makerCollateral
        );
        IERC20(config.collateralToken).safeTransferFrom(
            mintPredictionRequestData.taker,
            address(this),
            mintPredictionRequestData.takerCollateral
        );

        // 6- Mint NFTs and set prediction
        _safeMint(mintPredictionRequestData.maker, makerNftTokenId);
        _safeMint(mintPredictionRequestData.taker, takerNftTokenId);

        // 7- Set NFT mappings
        nftToPredictionId[makerNftTokenId] = predictionId;
        nftToPredictionId[takerNftTokenId] = predictionId;

        // 8- Add to auxiliary mappings
        nftByMakerAddress[mintPredictionRequestData.maker].add(makerNftTokenId);
        nftByTakerAddress[mintPredictionRequestData.taker].add(takerNftTokenId);

        // 9- Create and store prediction data
        predictions[predictionId].encodedPredictedOutcomes = mintPredictionRequestData.encodedPredictedOutcomes;
        predictions[predictionId].resolver = mintPredictionRequestData.resolver;
        predictions[predictionId].maker = mintPredictionRequestData.maker;
        predictions[predictionId].taker = mintPredictionRequestData.taker;
        predictions[predictionId].makerNftTokenId = makerNftTokenId;
        predictions[predictionId].takerNftTokenId = takerNftTokenId;
        predictions[predictionId].makerCollateral = mintPredictionRequestData.makerCollateral;
        predictions[predictionId].takerCollateral = mintPredictionRequestData.takerCollateral;
        predictions[predictionId].settled = false;
        predictions[predictionId].makerWon = false;

        return (makerNftTokenId, takerNftTokenId);
    }

    function burn(uint256 tokenId) external nonReentrant {
        uint256 predictionId = nftToPredictionId[tokenId];

        // 1- Get prediction from Store
        IPredictionStructs.PredictionData memory prediction = predictions[predictionId];

        // 2- Initial checks
        require(prediction.maker != address(0), "Prediction not found");
        require(prediction.taker != address(0), "Prediction not found");

        // 3- Ask resolver if markets are settled, and if prediction succeeded or not, it means maker won
        (bool isValid, , bool makerWon) = IPredictionMarketResolver(prediction.resolver)
            .resolvePrediction(prediction.encodedPredictedOutcomes);

        require(isValid, "Prediction resolution failed");

        // 4- Send collateral to winner
        uint256 payout = prediction.makerCollateral + prediction.takerCollateral;
        address winner = makerWon ? prediction.maker : prediction.taker;
        IERC20(config.collateralToken).safeTransfer(
            winner,
            payout
        );

        // 5- Set the prediction state (identify who won and set as closed)
        prediction.settled = true;
        prediction.makerWon = makerWon;

        // 6- Burn NFTs
        _burn(prediction.makerNftTokenId);
        _burn(prediction.takerNftTokenId);
    }

    // ============ Prediction Consolidation (pre-close) ============
    function consolidatePrediction(uint256 tokenId) external nonReentrant {
        uint256 predictionId = nftToPredictionId[tokenId];

        // 1- Get prediction from store
        IPredictionStructs.PredictionData memory prediction = predictions[predictionId];

        // 2- Initial checks
        require(prediction.maker != address(0), "Prediction not found");
        require(prediction.taker != address(0), "Prediction not found");

        require(
            prediction.maker == prediction.taker,
            "Maker and taker are different. Cannot consolidate"
        );

        // 3- Set as settled and maker won and send the collateral to the maker
        prediction.settled = true;
        prediction.makerWon = true;
        uint256 payout = prediction.makerCollateral + prediction.takerCollateral;
        IERC20(config.collateralToken).safeTransfer(
            prediction.maker,
            payout
        );

        // 4- Burn NFTs
        _burn(prediction.makerNftTokenId);
        _burn(prediction.takerNftTokenId);
    }

    // ============ View Functions ============

    function getConfig()
        external
        view
        returns (IPredictionStructs.Settings memory)
    {
        return config;
    }

    function getPrediction(
        uint256 tokenId
    )
        external
        view
        returns (
            IPredictionStructs.PredictionData memory predictionData
        )
    {
        uint256 predictionId = nftToPredictionId[tokenId];
        require(predictionId != 0 && _isPrediction(predictionId), "Prediction does not exist");

        predictionData = predictions[predictionId];
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

    function _isPrediction(uint256 id) internal view returns (bool) {
        return
            predictions[id].maker != address(0) &&
            predictions[id].taker != address(0) ;
    }
}
