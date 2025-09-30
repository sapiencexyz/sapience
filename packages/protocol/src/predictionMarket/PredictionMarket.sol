// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
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

    // ============ Custom Errors ============
    error InvalidCollateralToken();
    error InvalidMinCollateral();
    error MakerIsNotCaller();
    error InvalidEncodedPredictedOutcomes();
    error PredictionAlreadySettled();
    error CollateralBelowMinimum();
    error MakerCollateralMustBeGreaterThanZero();
    error TakerCollateralMustBeGreaterThanZero();
    error InvalidTakerSignature();
    error InvalidMarketsAccordingToResolver();
    error PredictionNotFound();
    error PredictionResolutionFailed();
    error MakerAndTakerAreDifferent();
    error PredictionDoesNotExist();
    error TakerDeadlineExpired();
    error TransferFailed();
    error OrderNotFound();
    error OrderExpired();
    error OrderNotExpired();

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

    // Mapping to track total collateral deposited by each user
    mapping(address => uint256) private userCollateralDeposits;

    // ============ Limit Order ============
    uint256 private orderIdCounter = 1; // initialize the order id counter to 1 (zero means no order)

    mapping(uint256 => IPredictionStructs.LimitOrderData)
        private unfilledOrders;
    
    mapping(address => EnumerableSet.UintSet) private unfilledOrdersByMaker;
    
    EnumerableSet.UintSet private unfilledOrderIds;


    // ============ Constructor ============

    constructor(
        string memory name,
        string memory symbol,
        address _collateralToken,
        uint256 _minCollateral
    ) ERC721(name, symbol) {
        if (_collateralToken == address(0)) revert InvalidCollateralToken();
        if (_minCollateral == 0) revert InvalidMinCollateral();

        config = IPredictionStructs.Settings({
            collateralToken: _collateralToken,
            minCollateral: _minCollateral
        });

        _predictionIdCounter = 1;
        _nftTokenIdCounter = 1;
    }

    // ============ Prediction Functions ============

    function mint(
        IPredictionStructs.MintPredictionRequestData
            calldata mintPredictionRequestData
    )
        external
        nonReentrant
        returns (uint256 makerNftTokenId, uint256 takerNftTokenId)
    {
        // 1- Initial checks
        if (mintPredictionRequestData.maker != msg.sender)
            revert MakerIsNotCaller();
        if (mintPredictionRequestData.takerDeadline < block.timestamp)
            revert TakerDeadlineExpired();

        if (mintPredictionRequestData.makerCollateral < config.minCollateral)
            revert CollateralBelowMinimum();
        if (mintPredictionRequestData.makerCollateral == 0)
            revert MakerCollateralMustBeGreaterThanZero();
        if (mintPredictionRequestData.takerCollateral == 0)
            revert TakerCollateralMustBeGreaterThanZero();
        if (mintPredictionRequestData.encodedPredictedOutcomes.length == 0)
            revert InvalidEncodedPredictedOutcomes();

        // 2- Confirm the taker signature is valid for this prediction (hash of predicted outcomes, taker collateral and maker collateral, resolver and maker address)
        bytes32 messageHash = keccak256(
            abi.encode(
                mintPredictionRequestData.encodedPredictedOutcomes,
                mintPredictionRequestData.takerCollateral,
                mintPredictionRequestData.makerCollateral,
                mintPredictionRequestData.resolver,
                mintPredictionRequestData.maker,
                mintPredictionRequestData.takerDeadline
            )
        );

        if (
            !_isApprovalValid(
                messageHash,
                mintPredictionRequestData.taker,
                mintPredictionRequestData.takerSignature
            )
        ) {
            // Not valid signature for EOA (ERC-712),
            // Check if it's a contract that implements ERC-1271
            try
                IERC1271(mintPredictionRequestData.taker).isValidSignature(
                    messageHash,
                    mintPredictionRequestData.takerSignature
                )
            returns (bytes4 magicValue) {
                if (magicValue != IERC1271.isValidSignature.selector) {
                    revert InvalidTakerSignature();
                }
            } catch {
                // Using the try-catch to handle the case where the taker is not a contract that implements ERC-1271
                revert InvalidTakerSignature();
            }
        }

        // 3- Collect collateral
        _safeTransferIn(
            config.collateralToken,
            mintPredictionRequestData.maker,
            mintPredictionRequestData.makerCollateral
        );
        _safeTransferIn(
            config.collateralToken,
            mintPredictionRequestData.taker,
            mintPredictionRequestData.takerCollateral
        );

        // 4- Create prediction using internal function
        (makerNftTokenId, takerNftTokenId) = _createPrediction(
            mintPredictionRequestData.encodedPredictedOutcomes,
            mintPredictionRequestData.resolver,
            mintPredictionRequestData.maker,
            mintPredictionRequestData.taker,
            mintPredictionRequestData.makerCollateral,
            mintPredictionRequestData.takerCollateral,
            mintPredictionRequestData.refCode
        );

        return (makerNftTokenId, takerNftTokenId);
    }

    function burn(uint256 tokenId, bytes32 refCode) external nonReentrant {
        uint256 predictionId = nftToPredictionId[tokenId];

        // 1- Get prediction from Store
        IPredictionStructs.PredictionData storage prediction = predictions[
            predictionId
        ];

        // 2- Initial checks
        if (prediction.maker == address(0)) revert PredictionNotFound();
        if (prediction.taker == address(0)) revert PredictionNotFound();
        if (prediction.settled) revert PredictionAlreadySettled();

        // 3- Ask resolver if markets are settled, and if prediction succeeded or not, it means maker won
        (bool isValid, , bool makerWon) = IPredictionMarketResolver(
            prediction.resolver
        ).resolvePrediction(prediction.encodedPredictedOutcomes);

        if (!isValid) revert PredictionResolutionFailed();

        // 4- Send collateral to winner
        uint256 payout = prediction.makerCollateral +
            prediction.takerCollateral;
        address winner = makerWon ? prediction.maker : prediction.taker;

        _safeTransferOut(config.collateralToken, winner, payout);

        // 4.1- Update user collateral deposits tracking
        userCollateralDeposits[prediction.maker] -= prediction.makerCollateral;
        userCollateralDeposits[prediction.taker] -= prediction.takerCollateral;

        // 5- Set the prediction state (identify who won and set as closed)
        prediction.settled = true;
        prediction.makerWon = makerWon;

        // 6- Burn NFTs
        _burn(prediction.makerNftTokenId);
        _burn(prediction.takerNftTokenId);

        emit PredictionBurned(
            prediction.maker,
            prediction.taker,
            prediction.encodedPredictedOutcomes,
            prediction.makerNftTokenId,
            prediction.takerNftTokenId,
            payout,
            makerWon,
            refCode
        );
    }

    function consolidatePrediction(
        uint256 tokenId,
        bytes32 refCode
    ) external nonReentrant {
        uint256 predictionId = nftToPredictionId[tokenId];

        // 1- Get prediction from store
        IPredictionStructs.PredictionData storage prediction = predictions[
            predictionId
        ];

        // 2- Initial checks
        if (prediction.maker == address(0)) revert PredictionNotFound();
        if (prediction.taker == address(0)) revert PredictionNotFound();
        if (prediction.settled) revert PredictionAlreadySettled();

        if (prediction.maker != prediction.taker)
            revert MakerAndTakerAreDifferent();

        // 3- Set as settled and maker won and send the collateral to the maker
        prediction.settled = true;
        prediction.makerWon = true;
        uint256 payout = prediction.makerCollateral +
            prediction.takerCollateral;
        _safeTransferOut(config.collateralToken, prediction.maker, payout);

        // 3.1- Update user collateral deposits tracking
        userCollateralDeposits[prediction.maker] -= prediction.makerCollateral;
        userCollateralDeposits[prediction.taker] -= prediction.takerCollateral;

        // 4- Burn NFTs
        _burn(prediction.makerNftTokenId);
        _burn(prediction.takerNftTokenId);

        emit PredictionConsolidated(
            prediction.makerNftTokenId,
            prediction.takerNftTokenId,
            payout,
            refCode
        );
    }

    // ============ Limit Order ============

    function placeOrder(
        IPredictionStructs.OrderRequestData calldata orderRequestData
    ) external nonReentrant returns (uint256 orderId) {
        address maker = msg.sender;

        if (orderRequestData.makerCollateral == 0)
            revert MakerCollateralMustBeGreaterThanZero();
        if (orderRequestData.takerCollateral == 0)
            revert TakerCollateralMustBeGreaterThanZero();
        if (orderRequestData.makerCollateral < config.minCollateral)
            revert CollateralBelowMinimum();

        // 1- Transfer collateral to the contract
        _safeTransferIn(
            config.collateralToken,
            maker,
            orderRequestData.makerCollateral
        );

        orderId = orderIdCounter++;

        // 2- Store order request data
        unfilledOrders[orderId] = IPredictionStructs.LimitOrderData({
            orderId: orderId,
            encodedPredictedOutcomes: orderRequestData.encodedPredictedOutcomes,
            resolver: orderRequestData.resolver,
            makerCollateral: orderRequestData.makerCollateral,
            takerCollateral: orderRequestData.takerCollateral,
            maker: maker,
            taker: address(0),
            orderDeadline: orderRequestData.orderDeadline
        });
        unfilledOrdersByMaker[maker].add(orderId);
        unfilledOrderIds.add(orderId);
        emit OrderPlaced(
            maker,
            orderId,
            orderRequestData.encodedPredictedOutcomes,
            orderRequestData.resolver,
            orderRequestData.makerCollateral,
            orderRequestData.takerCollateral,
            orderRequestData.refCode
        );
    }

    function fillOrder(uint256 orderId, bytes32 refCode) external nonReentrant {
        IPredictionStructs.LimitOrderData storage order = unfilledOrders[
            orderId
        ];
        if (order.orderId != orderId) revert OrderNotFound();
        if (order.orderDeadline < block.timestamp) revert OrderExpired();

        // 3- Transfer collateral to the taker
        address taker = msg.sender;
        _safeTransferIn(config.collateralToken, taker, order.takerCollateral);

        // 4- Create prediction using internal function
        _createPrediction(
            bytes(order.encodedPredictedOutcomes),
            order.resolver,
            order.maker,
            taker,
            order.makerCollateral,
            order.takerCollateral,
            refCode
        );

        // 5- Set the order as filled and remove from tracking
        order.orderId = 0; // zero means no order
        unfilledOrderIds.remove(orderId);
        unfilledOrdersByMaker[order.maker].remove(orderId);

        // 6- emit event
        emit OrderFilled(
            orderId,
            order.maker,
            taker,
            order.encodedPredictedOutcomes,
            order.makerCollateral,
            order.takerCollateral,
            refCode
        );
    }

    function cancelOrder(uint256 orderId) external nonReentrant {
        IPredictionStructs.LimitOrderData storage order = unfilledOrders[
            orderId
        ];
        if (order.orderId != orderId) revert OrderNotFound();
        if (block.timestamp < order.orderDeadline) revert OrderNotExpired();
        if (order.maker != msg.sender) revert MakerIsNotCaller();

        _safeTransferOut(
            config.collateralToken,
            order.maker,
            order.makerCollateral
        );

        order.orderId = 0; // zero means no order
        unfilledOrderIds.remove(orderId);
        unfilledOrdersByMaker[order.maker].remove(orderId);

        emit OrderCancelled(
            orderId,
            order.maker,
            order.encodedPredictedOutcomes,
            order.makerCollateral,
            order.takerCollateral
        );
    }

    function getUnfilledOrder(
        uint256 orderId
    ) external view returns (IPredictionStructs.LimitOrderData memory) {
        return unfilledOrders[orderId];
    }

    function getUnfilledOrderIds() external view returns (uint256[] memory) {
        return unfilledOrderIds.values();
    }

    function getUnfilledOrdersCount() external view returns (uint256) {
        return unfilledOrderIds.length();
    }

    function getUnfilledOrderByMaker(
        address maker
    ) external view returns (uint256[] memory) {
        return unfilledOrdersByMaker[maker].values();
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
        returns (IPredictionStructs.PredictionData memory predictionData)
    {
        uint256 predictionId = nftToPredictionId[tokenId];
        if (predictionId == 0 || !_isPrediction(predictionId))
            revert PredictionDoesNotExist();

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
        return
            nftByMakerAddress[account].length() +
            nftByTakerAddress[account].length();
    }

    /**
     * @notice Get the total collateral deposited by a user
     * @param user The address of the user
     * @return The total amount of collateral deposited by the user
     */
    function getUserCollateralDeposits(
        address user
    ) external view returns (uint256) {
        return userCollateralDeposits[user];
    }

    // ============ Internal Functions ============

    /// @dev Override ERC721 ownership update to keep auxiliary mappings and prediction parties in sync.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        from = super._update(to, tokenId, auth);

        uint256 predictionId = nftToPredictionId[tokenId];
        if (predictionId == 0) {
            return from;
        }

        IPredictionStructs.PredictionData storage prediction = predictions[predictionId];

        bool isMakerToken = tokenId == prediction.makerNftTokenId;
        bool isTakerToken = tokenId == prediction.takerNftTokenId;

        // Keep role-based NFT ownership indexes in sync
        if (from != address(0)) {
            if (isMakerToken) {
                nftByMakerAddress[from].remove(tokenId);
            }
            if (isTakerToken) {
                nftByTakerAddress[from].remove(tokenId);
            }
        }
        if (to != address(0)) {
            if (isMakerToken) {
                nftByMakerAddress[to].add(tokenId);
            }
            if (isTakerToken) {
                nftByTakerAddress[to].add(tokenId);
            }
        }

        // Update prediction parties on transfers (not on burn)
        if (to != address(0)) {
            if (isMakerToken) {
                prediction.maker = to;
            } else if (isTakerToken) {
                prediction.taker = to;
            }
        }

        // Move collateral deposit attribution on user-to-user transfers only
        if (from != address(0) && to != address(0)) {
            if (isMakerToken) {
                userCollateralDeposits[from] -= prediction.makerCollateral;
                userCollateralDeposits[to] += prediction.makerCollateral;
            } else if (isTakerToken) {
                userCollateralDeposits[from] -= prediction.takerCollateral;
                userCollateralDeposits[to] += prediction.takerCollateral;
            }
        }

        return from;
    }

    function _isPrediction(uint256 id) internal view returns (bool) {
        return
            predictions[id].maker != address(0) &&
            predictions[id].taker != address(0);
    }

    function _createPrediction(
        bytes memory encodedPredictedOutcomes,
        address resolver,
        address maker,
        address taker,
        uint256 makerCollateral,
        uint256 takerCollateral,
        bytes32 refCode
    ) internal returns (uint256 makerNftTokenId, uint256 takerNftTokenId) {
        // 1- Ask resolver if markets are OK
        (bool isValid, ) = IPredictionMarketResolver(resolver)
            .validatePredictionMarkets(encodedPredictedOutcomes);

        if (!isValid) revert InvalidMarketsAccordingToResolver();

        // 2- Set the prediction data
        uint256 predictionId = _predictionIdCounter++;

        makerNftTokenId = _nftTokenIdCounter++;
        takerNftTokenId = _nftTokenIdCounter++;
        predictions[predictionId] = IPredictionStructs.PredictionData({
            encodedPredictedOutcomes: encodedPredictedOutcomes,
            predictionId: predictionId,
            resolver: resolver,
            maker: maker,
            taker: taker,
            makerNftTokenId: makerNftTokenId,
            takerNftTokenId: takerNftTokenId,
            makerCollateral: makerCollateral,
            takerCollateral: takerCollateral,
            settled: false,
            makerWon: false
        });

        // 3- Update user collateral deposits tracking
        userCollateralDeposits[maker] += makerCollateral;
        userCollateralDeposits[taker] += takerCollateral;

        // 4- Set NFT mappings before minting (needed for _update override)
        nftToPredictionId[makerNftTokenId] = predictionId;
        nftToPredictionId[takerNftTokenId] = predictionId;

        // 5- Mint NFTs
        _safeMint(maker, makerNftTokenId);
        _safeMint(taker, takerNftTokenId);

        // 6- Emit prediction minted event
        emit PredictionMinted(
            maker,
            taker,
            encodedPredictedOutcomes,
            makerNftTokenId,
            takerNftTokenId,
            makerCollateral,
            takerCollateral,
            makerCollateral + takerCollateral,
            refCode
        );
    }

    function _safeTransferIn(
        address token,
        address from,
        uint256 amount
    ) internal {
        uint256 initialBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        uint256 finalBalance = IERC20(token).balanceOf(address(this));
        // for in bound transfers we need to ensure contract collateral increased at least by the amount
        if (finalBalance < initialBalance + amount) revert TransferFailed();
    }

    function _safeTransferOut(
        address token,
        address to,
        uint256 amount
    ) internal {
        uint256 initialBalance = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(to, amount);
        uint256 finalBalance = IERC20(token).balanceOf(address(this));
        // for out bound transfers we need to ensure contract collateral deducted no more than the amount
        if (finalBalance + amount < initialBalance) revert TransferFailed();
    }
}
