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
import "./interfaces/IParlayPoolResolverCallback.sol";
import "./interfaces/IParlayPoolResolver.sol";
import "./interfaces/IParlayEvents.sol";
import "../market/interfaces/ISapience.sol";
import "../market/interfaces/ISapienceStructs.sol";
import "./ApproveWithSignature.sol";

/**
 * @title ParlayPool
 * @notice Implementation of the Parlay Pool contract with orderbook functionality
 */
contract ParlayPool is
    ERC721,
    IParlayPool,
    ReentrancyGuard,
    ApproveWithSignature
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

    // Auxiliary mappings to track unfilled orders
    EnumerableSet.UintSet private unfilledOrders;

    // Auxiliary mappings to track all orders by maker and taker
    mapping(address => EnumerableSet.UintSet) private ordersByMaker;
    mapping(address => EnumerableSet.UintSet) private ordersByTaker;

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
    ) external returns (uint256 requestId) {
        // 1- Initial checks
        require(
            mintParlayRequestData.mintExpirationTime > block.timestamp,
            "Order expiration must be in future"
        );
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

        // 2- Store parlay request data  (only if we are on a async mode)
        requestId = _parlayIdCounter++;
        mintParlayDataByRequestId[requestId] = mintParlayRequestData;

        // 3- Ask resolver if markets are OK
        bool syncCallSucceded = IParlayPoolResolver(
            mintParlayRequestData.resolver
        ).validateParlayMarkets(
                mintParlayRequestData.predictedOutcomes,
                true,
                requestId
            );
        validateParlayMarketsCallback(requestId, syncCallSucceded);
    }

    function validateParlayMarketsCallback(
        uint256 requestId,
        bool validMarkets
    ) public nonReentrant {
        require(validMarkets, "Invalid markets according to resolver");

        // 4- Recover the mint parlay request data
        MintParlayRequestData
            memory mintParlayRequestData = mintParlayDataByRequestId[requestId];

        // 5- Check if called by appropiate address
        _onlySelfOrResolver(mintParlayRequestData);

        // 6- Set the parlay data
        uint256 makerNftTokenId = _nftTokenIdCounter++;
        uint256 takerNftTokenId = _nftTokenIdCounter++;
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
            orderExpirationTime: mintParlayRequestData.mintExpirationTime,
            settled: false,
            makerWon: false
        });

        // 7- Collact collateral
        // Approve collateral token for both maker and taker using the signatures
        ApproveWithSignature.approveWithSignature(
            config.collateralToken,
            mintParlayRequestData.maker,
            mintParlayRequestData.makerCollateral,
            mintParlayRequestData.makerSignature
        );
        ApproveWithSignature.approveWithSignature(
            config.collateralToken,
            mintParlayRequestData.taker,
            mintParlayRequestData.takerCollateral,
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
    }

    function _onlySelfOrResolver(
        MintParlayRequestData memory mintParlayRequestData
    ) internal {
        require(
            msg.sender == address(this) ||
                msg.sender == mintParlayRequestData.resolver,
            "Not allowed to call this function"
        );
    }

    function burn(uint256 tokenId) external {
        uint256 parlayId = nftToParlayId[tokenId];
        // 1- Get parlay from Store
        IParlayStructs.ParlayData memory parlay = parlays[parlayId];

        // 2- Initial checks
        require(parlay.maker != address(0), "Parlay not found");
        require(parlay.taker != address(0), "Parlay not found");
        require(parlay.filled, "Parlay not filled");

        // 3- Ask resolver if markets are settled, and if parlay succeeded or not, it means maker won
        (bool syncCallSucceded, bool makerWon) = IParlayPoolResolver(parlay.resolver)
            .resolveParlay(parlayPredictedOutcomes[parlayId], true, parlayId);
        resolveParlayCallback(tokenId, syncCallSucceded, makerWon);
    }

    function resolveParlayCallback(
        uint256 parlayId,
        bool syncCallSucceded,
        bool makerWon
    ) public nonReentrant {
        require(syncCallSucceded, "Parlay resolution failed");
        // 4- Recover parlay from store
        IParlayStructs.ParlayData memory parlay = parlays[parlayId];
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
    function consolidateParlay(uint256 tokenId) external {
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

    // ============ Parlay Order Functions ============

    // function submitParlayOrder(
    //     IParlayStructs.PredictedOutcome[] calldata predictedOutcomes,
    //     address resolver,
    //     uint256 makerCollateral,
    //     uint256 payout,
    //     uint256 orderExpirationTime,
    //     bytes32 refCode
    // )
    //     external
    //     nonReentrant
    //     returns (uint256 requestId)
    // {
    //     require(
    //         orderExpirationTime > block.timestamp,
    //         "Order expiration must be in future"
    //     );
    //     require(predictedOutcomes.length > 0, "Must have at least one market");
    //     require(
    //         predictedOutcomes.length <= config.maxParlayMarkets,
    //         "Too many markets"
    //     );
    //     require(makerCollateral >= config.minCollateral, "Collateral below minimum");
    //     require(payout > makerCollateral, "Payout must be greater than collateral");

    //     // TODO Call resolver to check if the markets are OK.
    //     if (!IParlayPoolResolver(resolver).validateParlayMarkets(predictedOutcomes, true)) {
    //         require(false,"invalid markets according to resolver");
    //     }

    //     _parlayIdCounter++;
    //     requestId = _parlayIdCounter;

    //     // Add request to unfilled orders
    //     unfilledOrders.add(requestId);

    //     // Add request to maker's orders
    //     ordersByMaker[msg.sender].add(requestId);

    //     uint256 balanceBefore = IERC20(config.collateralToken).balanceOf(
    //         address(this)
    //     );

    //     IERC20(config.collateralToken).safeTransferFrom(
    //         msg.sender,
    //         address(this),
    //         makerCollateral
    //     );

    //     uint256 balanceAfter = IERC20(config.collateralToken).balanceOf(
    //         address(this)
    //     );
    //     require(
    //         balanceAfter - balanceBefore == makerCollateral,
    //         "Collateral transfer failed"
    //     );

    //     parlays[requestId] = IParlayStructs.ParlayData({
    //         // Request data
    //         maker: msg.sender,
    //         orderExpirationTime: orderExpirationTime,
    //         filled: false,
    //         taker: address(0),
    //         // Parlay data (will be filled later)
    //         makerNftTokenId: 0,
    //         takerNftTokenId: 0,
    //         collateral: makerCollateral,
    //         payout: payout,
    //         createdAt: block.timestamp,
    //         settled: false,
    //         makerWon: false // Will be set during settlement
    //     });

    //     // Store predicted outcomes one by one
    //     for (uint256 i = 0; i < predictedOutcomes.length; i++) {
    //         parlayPredictedOutcomes[requestId].push(predictedOutcomes[i]);
    //     }

    //     emit ParlayOrderSubmitted(
    //         msg.sender,
    //         requestId,
    //         predictedOutcomes,
    //         makerCollateral,
    //         payout,
    //         orderExpirationTime,
    //         refCode
    //     );
    // }

    // struct FillParlayOrderRuntime {
    //     uint256 requestId;
    //     bytes32 refCode;
    //     IParlayStructs.ParlayData request;
    //     uint256 delta;
    //     uint256 takerBalance;
    // }

    // function fillParlayOrder(uint256 requestId, bytes32 refCode) external nonReentrant {
    //     require(
    //         parlays[requestId].maker != address(0),
    //         "Request does not exist"
    //     );
    //     require(
    //         parlays[requestId].maker != msg.sender,
    //         "Maker cannot fill their own order"
    //     );
    //     FillParlayOrderRuntime memory runtime;

    //     runtime.requestId = requestId;
    //     runtime.refCode = refCode;
    //     runtime.request = parlays[requestId];

    //     require(!runtime.request.filled, "Order already filled");
    //     require(block.timestamp < runtime.request.orderExpirationTime, "Order expired");
    //     // TODO Add a require for a delay between order submission and order filling

    //     // Check if taker is approved (if approved takers list is not empty)
    //     if (config.approvedTakers.length > 0) {
    //         require(approvedTakers[msg.sender], "Taker not approved for this order");
    //     }

    //     // Calculate the delta (profit amount) that taker needs to provide
    //     runtime.delta = runtime.request.payout - runtime.request.collateral;

    //     // Check if taker has sufficient balance for the delta
    //     runtime.takerBalance = IERC20(config.collateralToken).balanceOf(
    //         msg.sender
    //     );
    //     require(runtime.takerBalance >= runtime.delta, "Insufficient taker balance");

    //     // Transfer delta from taker to contract
    //     uint256 balanceBefore = IERC20(config.collateralToken).balanceOf(
    //         address(this)
    //     );
    //     IERC20(config.collateralToken).safeTransferFrom(
    //         msg.sender,
    //         address(this),
    //         runtime.delta
    //     );
    //     uint256 balanceAfter = IERC20(config.collateralToken).balanceOf(
    //         address(this)
    //     );
    //     require(balanceAfter - balanceBefore == runtime.delta, "Delta transfer failed");

    //     // Mint NFTs with unique token IDs
    //     _nftTokenIdCounter++;
    //     uint256 makerNftTokenId = _nftTokenIdCounter;

    //     _nftTokenIdCounter++;
    //     uint256 takerNftTokenId = _nftTokenIdCounter;

    //     // Mark request as filled and update with parlay data
    //     parlays[requestId].filled = true;
    //     parlays[requestId].taker = msg.sender;
    //     parlays[requestId].makerNftTokenId = makerNftTokenId;
    //     parlays[requestId].takerNftTokenId = takerNftTokenId;

    //     // Remove request from unfilled orders
    //     unfilledOrders.remove(requestId);

    //     // Add request to taker's orders
    //     ordersByTaker[msg.sender].add(requestId);

    //     // Use the same ID - no need to move data
    //     uint256 parlayId = requestId;

    //     // Map NFT token IDs to parlay ID
    //     nftToParlayId[makerNftTokenId] = parlayId;
    //     nftIsMaker[makerNftTokenId] = true;
    //     nftToParlayId[takerNftTokenId] = parlayId;
    //     nftIsMaker[takerNftTokenId] = false;

    //     // Mint NFTs to respective owners
    //    _safeMint(runtime.request.maker, makerNftTokenId);
    //    _safeMint(msg.sender, takerNftTokenId);

    //     emit ParlayOrderFilled(
    //         runtime.requestId,
    //         runtime.request.maker,
    //         msg.sender,
    //         makerNftTokenId,
    //         takerNftTokenId,
    //         runtime.request.collateral,
    //         runtime.delta,
    //         runtime.request.payout,
    //         runtime.refCode
    //     );
    // }

    // ============ Parlay Settlement Functions ============

    // function settleParlay(uint256 tokenId) public  {
    //     _onlyValidParlay(tokenId);
    //     uint256 parlayId = nftToParlayId[tokenId];
    //     IParlayStructs.ParlayData storage parlay = parlays[parlayId];
    //     require(!parlay.settled, "Parlay already settled");
    //     require(
    //         block.timestamp >= parlay.createdAt + 30 days,
    //         "Parlay not expired yet"
    //     );

    //     bool makerWon = true;
    //     IParlayStructs.PredictedOutcome[]
    //         storage predictedOutcomes = parlayPredictedOutcomes[parlayId];

    //     for (uint256 i = 0; i < predictedOutcomes.length; i++) {
    //         IParlayStructs.Market memory market = predictedOutcomes[i].market;
    //         (bool marketOutcome, bool marketSettled) = _getMarketOutcome(
    //             market
    //         );
    //         require(marketSettled, "At least one market not settled");
    //         if (predictedOutcomes[i].prediction != marketOutcome) {
    //             makerWon = false;
    //             break;
    //         }
    //     }

    //     parlay.makerWon = makerWon;
    //     parlay.settled = true;

    //     emit ParlaySettled(
    //         parlay.makerNftTokenId,
    //         parlay.takerNftTokenId,
    //         parlay.payout,
    //         makerWon
    //     );
    // }

    // function settleAndWithdrawParlayCollateral(
    //     uint256 tokenId
    // ) public  {
    //     _onlyValidParlay(tokenId);
    //     settleParlay(tokenId);
    //     withdrawParlayCollateral(tokenId);
    // }

    // function withdrawParlayCollateral(
    //     uint256 tokenId
    // ) public nonReentrant {
    //     _onlyValidParlay(tokenId);
    //     uint256 parlayId = nftToParlayId[tokenId];
    //     IParlayStructs.ParlayData storage parlay = parlays[parlayId];
    //     require(parlay.settled, "Parlay not settled");

    //     // Check if caller owns the NFT
    //     bool isMakerNFT = tokenId == parlay.makerNftTokenId;
    //     bool isTakerNFT = tokenId == parlay.takerNftTokenId;

    //     require(isMakerNFT || isTakerNFT, "Not parlay NFT owner");

    //     address nftOwner = ownerOf(tokenId);
    //     isMakerNFT = nftIsMaker[tokenId];

    //     require(nftOwner == msg.sender, "Not NFT owner");

    //     // Only allow the winner to withdraw
    //     if (parlay.makerWon) {
    //         require(isMakerNFT, "Only maker can withdraw when maker wins");
    //     } else {
    //         require(isTakerNFT, "Only taker can withdraw when maker loses");
    //     }

    //     uint256 withdrawAmount = parlay.payout;
    //     require(withdrawAmount > 0, "No payout to withdraw");

    //     // Reset payout to prevent double withdrawal
    //     parlay.payout = 0;

    //     // Transfer payout
    //     IERC20(config.collateralToken).safeTransfer(msg.sender, withdrawAmount);

    //     emit ParlayCollateralWithdrawn(tokenId, msg.sender, withdrawAmount);
    // }

    // function cancelExpiredOrder(
    //     uint256 requestId
    // ) external {
    //     require(_isRequest(requestId), "Request does not exist");
    //     IParlayStructs.ParlayData storage request = parlays[requestId];

    //     require(!request.filled, "Order already filled");
    //     require(request.collateral > 0, "Collateral already withdrawn");
    //     require(
    //         block.timestamp >= request.orderExpirationTime,
    //         "Order not expired yet"
    //     );
    //     require(
    //         msg.sender == request.maker,
    //         "Only maker can cancel expired order"
    //     );

    //     uint256 collateral = request.collateral;
    //     address maker = request.maker;

    //     // Reset request data
    //     request.collateral = 0;
    //     request.payout = 0;
    //     request.maker = address(0);

    //     // Remove request from unfilled orders
    //     unfilledOrders.remove(requestId);

    //     // Remove request from maker's orders
    //     ordersByMaker[maker].remove(requestId);

    //     // Return collateral to maker
    //     IERC20(config.collateralToken).safeTransfer(maker, collateral);

    //     emit OrderExpired(requestId, maker, collateral);
    // }

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

    function getParlayById(
        uint256 parlayId
    )
        external
        view
        returns (
            IParlayStructs.ParlayData memory parlayData,
            IParlayStructs.PredictedOutcome[] memory predictedOutcomes
        )
    {
        (parlayData, predictedOutcomes) = _getParlayView(parlayId);
    }

    function getParlayByIds(
        uint256[] calldata parlayIds
    )
        external
        view
        returns (
            IParlayStructs.ParlayData[] memory parlayDataList,
            IParlayStructs.PredictedOutcome[][] memory predictedOutcomesList
        )
    {
        uint256 len = parlayIds.length;
        parlayDataList = new IParlayStructs.ParlayData[](len);
        predictedOutcomesList = new IParlayStructs.PredictedOutcome[][](len);

        for (uint256 i = 0; i < len; i++) {
            (
                IParlayStructs.ParlayData memory dataItem,
                IParlayStructs.PredictedOutcome[] memory outcomesItem
            ) = _getParlayView(parlayIds[i]);
            parlayDataList[i] = dataItem;
            predictedOutcomesList[i] = outcomesItem;
        }
    }

    function getParlayOrder(
        uint256 requestId
    )
        external
        view
        returns (
            IParlayStructs.ParlayData memory parlayData,
            IParlayStructs.PredictedOutcome[] memory predictedOutcomes
        )
    {
        parlayData = parlays[requestId];
        predictedOutcomes = parlayPredictedOutcomes[requestId];
    }

    function canFillParlayOrder(
        uint256 requestId
    ) external view returns (bool canFill, uint256 reason) {
        if (parlays[requestId].maker == address(0)) {
            return (false, 1); // Request does not exist
        }

        IParlayStructs.ParlayData storage request = parlays[requestId];

        if (request.filled) {
            return (false, 2); // Order already filled
        }

        if (block.timestamp >= request.orderExpirationTime) {
            return (false, 3); // Order expired
        }

        return (true, 0);
    }

    /**
     * @notice Get all unfilled order IDs
     */
    function getUnfilledOrderIds()
        external
        view
        returns (uint256[] memory orderIds)
    {
        orderIds = unfilledOrders.values();
    }

    /**
     * @notice Get all order IDs where `account` is the maker or taker
     * @dev Includes both unfilled and filled orders. Canceled orders are excluded (maker reset to address(0)).
     * @param account Address to filter by
     */
    function getOrderIdsByAddress(
        address account
    ) external view returns (uint256[] memory orderIds) {
        // Get all orders by maker
        uint256[] memory makerOrderIds = ordersByMaker[account].values();
        uint256 makerOrderIdsLength = makerOrderIds.length;

        // Get all orders by taker
        uint256[] memory takerOrderIds = ordersByTaker[account].values();
        uint256 takerOrderIdsLength = takerOrderIds.length;

        uint256 totalCount = makerOrderIdsLength + takerOrderIdsLength;
        orderIds = new uint256[](totalCount);

        for (uint256 i = 0; i < totalCount; i++) {
            orderIds[i] = i < makerOrderIdsLength
                ? makerOrderIds[i]
                : takerOrderIds[i - makerOrderIdsLength];
        }
    }

    // ============ Internal Functions ============

    function _isRequest(uint256 id) internal view returns (bool) {
        return parlays[id].maker != address(0) && !parlays[id].filled;
    }

    function _isParlay(uint256 id) internal view returns (bool) {
        return
            parlays[id].maker != address(0) &&
            parlays[id].taker != address(0) &&
            parlays[id].filled;
    }

    /**
     * @notice Internal function to get the outcome and settlement status of a market
     * @dev it needs to go to the market address as a Sapience market group and check if the market is settled
     * and then get the outcome of the market. The market should be a Yes/No Sapience market.
     * @param market The market to check
     * @return outcome The outcome of the market (true = YES, false = NO)
     * @return settled Whether the market has been settled
     */
    function _getMarketOutcome(
        IParlayStructs.Market memory market
    ) internal view returns (bool outcome, bool settled) {
        // Validate market address
        require(
            market.marketGroup != address(0),
            "Invalid market group address"
        );

        // Get the specific market data from the Sapience market group
        (ISapienceStructs.MarketData memory marketData, ) = ISapience(
            market.marketGroup
        ).getMarket(market.marketId);

        // Check if the market is settled
        settled = marketData.settled;

        if (!settled) {
            return (false, false);
        }

        // For Yes/No markets, the settlement price will be at the extreme bounds
        // YES = maxPriceD18, NO = minPriceD18
        uint256 settlementPrice = marketData.settlementPriceD18;
        uint256 minPrice = marketData.minPriceD18;
        uint256 maxPrice = marketData.maxPriceD18;

        // Check if this is a Yes/No market by comparing settlement price to bounds
        if (settlementPrice >= maxPrice) {
            // Market settled as YES
            outcome = true;
        } else if (settlementPrice <= minPrice) {
            // Market settled as NO
            outcome = false;
        } else {
            // This is a numeric market, not Yes/No
            // For parlay purposes, we only support Yes/No markets
            revert(
                "Market is not a Yes/No market - settlement price is not at bounds"
            );
        }
    }

    function _getParlayView(
        uint256 parlayId
    )
        internal
        view
        returns (
            IParlayStructs.ParlayData memory parlayData,
            IParlayStructs.PredictedOutcome[] memory predictedOutcomes
        )
    {
        require(
            parlayId != 0 &&
                parlayId <= _parlayIdCounter &&
                _isParlay(parlayId),
            "Parlay does not exist"
        );

        parlayData = parlays[parlayId];
        predictedOutcomes = parlayPredictedOutcomes[parlayId];
    }

    function _onlyValidParlay(uint256 tokenId) internal {
        uint256 parlayId = nftToParlayId[tokenId];
        require(parlayId != 0 && _isParlay(parlayId), "Parlay does not exist");
    }
}
