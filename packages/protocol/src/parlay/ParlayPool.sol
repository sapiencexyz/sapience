// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/IParlayPool.sol";
import "./interfaces/IParlayNFT.sol";
import "./interfaces/IParlayStructs.sol";
import "./interfaces/IParlayEvents.sol";
import "../market/interfaces/ISapience.sol";
import "../market/interfaces/ISapienceStructs.sol";

/**
 * @title ParlayPool
 * @notice Implementation of the Parlay Pool contract with orderbook functionality
 */
contract ParlayPool is IParlayPool, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.UintSet;
    // ============ State Variables ============

    IParlayStructs.Settings public config;

    uint256 private _parlayIdCounter; // Single ID for both requests and parlays
    uint256 private _nftTokenIdCounter; // Single counter for both maker and taker NFTs

    mapping(uint256 => IParlayStructs.ParlayData) public parlays;
    mapping(uint256 => IParlayStructs.PredictedOutcome[])
        public parlayPredictedOutcomes;

    mapping(uint256 => uint256) public makerNftToParlayId; // makerNftTokenId => parlayId
    mapping(uint256 => uint256) public takerNftToParlayId; // takerNftTokenId => parlayId

    // Auxiliary mappings to track unfilled orders
    EnumerableSet.UintSet private unfilledOrders;

    // Auxiliary mappings to track all orders by maker and taker
    mapping(address => EnumerableSet.UintSet) private ordersByMaker;
    mapping(address => EnumerableSet.UintSet) private ordersByTaker;

    // Auxiliary mapping to track approved takers
    mapping(address => bool) private approvedTakers;

    // ============ Modifiers ============

    modifier onlyValidRequest(uint256 requestId) {
        require(_isRequest(requestId), "Request does not exist");
        _;
    }

    modifier onlyValidParlay(uint256 tokenId) {
        uint256 parlayId = _getParlayId(tokenId);
        require(parlayId != 0 && _isParlay(parlayId), "Parlay does not exist");
        _;
    }

    modifier onlyValidExpirationTime(uint256 orderExpirationTime) {
        require(
            orderExpirationTime > block.timestamp,
            "Order expiration must be in future"
        );
        _;
    }

    // ============ Constructor ============

    constructor(
        address _collateralToken,
        address _makerNft,
        address _takerNft,
        uint256 _maxParlayMarkets,
        uint256 _minCollateral,
        uint256 _minRequestExpirationTime,
        uint256 _maxRequestExpirationTime,
        address[] memory _approvedTakers
    ) {
        require(_collateralToken != address(0), "Invalid collateral token");
        require(_makerNft != address(0), "Invalid maker NFT");
        require(_takerNft != address(0), "Invalid taker NFT");
        require(
            _makerNft != _takerNft,
            "Maker and taker NFTs cannot be the same"
        );
        require(_minCollateral > 0, "Invalid min collateral");
        require(_minRequestExpirationTime > 0, "Invalid min expiration time");
        require(
            _maxRequestExpirationTime > _minRequestExpirationTime,
            "Invalid max expiration time"
        );

        config = IParlayStructs.Settings({
            collateralToken: _collateralToken,
            makerNft: _makerNft,
            takerNft: _takerNft,
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

    // ============ Parlay Order Functions ============

    function submitParlayOrder(
        IParlayStructs.PredictedOutcome[] calldata predictedOutcomes,
        uint256 collateral,
        uint256 payout,
        uint256 orderExpirationTime,
        bytes32 refCode
    )
        external
        onlyValidExpirationTime(orderExpirationTime)
        nonReentrant
        returns (uint256 requestId)
    {
        require(predictedOutcomes.length > 0, "Must have at least one market");
        require(
            predictedOutcomes.length <= config.maxParlayMarkets,
            "Too many markets"
        );
        require(collateral >= config.minCollateral, "Collateral below minimum");
        require(payout > collateral, "Payout must be greater than collateral");
        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            require(
                predictedOutcomes[i].market.marketGroup != address(0),
                "Invalid market group address"
            );

            // Check that the market is a Yes/No market
            require(
                _isYesNoMarket(predictedOutcomes[i].market),
                "Market is not a Yes/No market"
            );

            // Check that the market is not settled
            (, bool settled) = _getMarketOutcome(predictedOutcomes[i].market);
            require(!settled, "Market is already settled");
        }

        _parlayIdCounter++;
        requestId = _parlayIdCounter;

        // Add request to unfilled orders
        unfilledOrders.add(requestId);

        // Add request to maker's orders
        ordersByMaker[msg.sender].add(requestId);

        uint256 balanceBefore = IERC20(config.collateralToken).balanceOf(
            address(this)
        );

        IERC20(config.collateralToken).safeTransferFrom(
            msg.sender,
            address(this),
            collateral
        );

        uint256 balanceAfter = IERC20(config.collateralToken).balanceOf(
            address(this)
        );
        require(
            balanceAfter - balanceBefore == collateral,
            "Collateral transfer failed"
        );

        parlays[requestId] = IParlayStructs.ParlayData({
            // Request data
            maker: msg.sender,
            orderExpirationTime: orderExpirationTime,
            filled: false,
            taker: address(0),
            // Parlay data (will be filled later)
            makerNftTokenId: 0,
            takerNftTokenId: 0,
            collateral: collateral,
            payout: payout,
            createdAt: block.timestamp,
            settled: false,
            makerWon: false // Will be set during settlement
        });

        // Store predicted outcomes one by one
        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            parlayPredictedOutcomes[requestId].push(predictedOutcomes[i]);
        }

        emit ParlayOrderSubmitted(
            msg.sender,
            requestId,
            predictedOutcomes,
            collateral,
            payout,
            orderExpirationTime,
            refCode
        );
    }

    struct FillParlayOrderRuntime {
        uint256 requestId;
        bytes32 refCode;
        IParlayStructs.ParlayData request;
        uint256 delta;
        uint256 takerBalance;
    }

    function fillParlayOrder(uint256 requestId, bytes32 refCode) external nonReentrant {
        require(
            parlays[requestId].maker != address(0),
            "Request does not exist"
        );
        require(
            parlays[requestId].maker != msg.sender,
            "Maker cannot fill their own order"
        );
        FillParlayOrderRuntime memory runtime;

        runtime.requestId = requestId;
        runtime.refCode = refCode;
        runtime.request = parlays[requestId];

        require(!runtime.request.filled, "Order already filled");
        require(block.timestamp < runtime.request.orderExpirationTime, "Order expired");
        // TODO Add a require for a delay between order submission and order filling

        // Check if taker is approved (if approved takers list is not empty)
        if (config.approvedTakers.length > 0) {
            require(approvedTakers[msg.sender], "Taker not approved for this order");
        }

        // Calculate the delta (profit amount) that taker needs to provide
        runtime.delta = runtime.request.payout - runtime.request.collateral;

        // Check if taker has sufficient balance for the delta
        runtime.takerBalance = IERC20(config.collateralToken).balanceOf(
            msg.sender
        );
        require(runtime.takerBalance >= runtime.delta, "Insufficient taker balance");

        // Transfer delta from taker to contract
        uint256 balanceBefore = IERC20(config.collateralToken).balanceOf(
            address(this)
        );
        IERC20(config.collateralToken).safeTransferFrom(
            msg.sender,
            address(this),
            runtime.delta
        );
        uint256 balanceAfter = IERC20(config.collateralToken).balanceOf(
            address(this)
        );
        require(balanceAfter - balanceBefore == runtime.delta, "Delta transfer failed");

        // Mint NFTs with unique token IDs
        _nftTokenIdCounter++;
        uint256 makerNftTokenId = _nftTokenIdCounter;

        _nftTokenIdCounter++;
        uint256 takerNftTokenId = _nftTokenIdCounter;

        // Mark request as filled and update with parlay data
        parlays[requestId].filled = true;
        parlays[requestId].taker = msg.sender;
        parlays[requestId].makerNftTokenId = makerNftTokenId;
        parlays[requestId].takerNftTokenId = takerNftTokenId;

        // Remove request from unfilled orders
        unfilledOrders.remove(requestId);

        // Add request to taker's orders
        ordersByTaker[msg.sender].add(requestId);

        // Use the same ID - no need to move data
        uint256 parlayId = requestId;

        // Map NFT token IDs to parlay ID
        makerNftToParlayId[makerNftTokenId] = parlayId;
        takerNftToParlayId[takerNftTokenId] = parlayId;

        // Mint NFTs to respective owners
        IParlayNFT(config.makerNft).mint(runtime.request.maker, makerNftTokenId);
        IParlayNFT(config.takerNft).mint(msg.sender, takerNftTokenId);

        emit ParlayOrderFilled(
            runtime.requestId,
            runtime.request.maker,
            msg.sender,
            makerNftTokenId,
            takerNftTokenId,
            runtime.request.collateral,
            runtime.delta,
            runtime.request.payout,
            runtime.refCode
        );
    }

    // ============ Parlay Settlement Functions ============

    function settleParlay(uint256 tokenId) public onlyValidParlay(tokenId) {
        uint256 parlayId = _getParlayId(tokenId);
        IParlayStructs.ParlayData storage parlay = parlays[parlayId];
        require(!parlay.settled, "Parlay already settled");
        require(
            block.timestamp >= parlay.createdAt + 30 days,
            "Parlay not expired yet"
        );

        bool makerWon = true;
        IParlayStructs.PredictedOutcome[]
            storage predictedOutcomes = parlayPredictedOutcomes[parlayId];

        for (uint256 i = 0; i < predictedOutcomes.length; i++) {
            IParlayStructs.Market memory market = predictedOutcomes[i].market;
            (bool marketOutcome, bool marketSettled) = _getMarketOutcome(
                market
            );
            require(marketSettled, "At least one market not settled");
            if (predictedOutcomes[i].prediction != marketOutcome) {
                makerWon = false;
                break;
            }
        }

        parlay.makerWon = makerWon;
        parlay.settled = true;

        emit ParlaySettled(
            parlay.makerNftTokenId,
            parlay.takerNftTokenId,
            parlay.payout,
            makerWon
        );
    }

    function settleAndWithdrawParlayCollateral(
        uint256 tokenId
    ) public onlyValidParlay(tokenId) {
        settleParlay(tokenId);
        withdrawParlayCollateral(tokenId);
    }

    function withdrawParlayCollateral(
        uint256 tokenId
    ) public onlyValidParlay(tokenId) nonReentrant {
        uint256 parlayId = _getParlayId(tokenId);
        IParlayStructs.ParlayData storage parlay = parlays[parlayId];
        require(parlay.settled, "Parlay not settled");

        // Check if caller owns the NFT
        bool isMakerNFT = tokenId == parlay.makerNftTokenId;
        bool isTakerNFT = tokenId == parlay.takerNftTokenId;

        require(isMakerNFT || isTakerNFT, "Not parlay NFT owner");

        address nftOwner;
        if (isMakerNFT) {
            nftOwner = IParlayNFT(config.makerNft).ownerOf(tokenId);
        } else {
            nftOwner = IParlayNFT(config.takerNft).ownerOf(tokenId);
        }

        require(nftOwner == msg.sender, "Not NFT owner");

        // Only allow the winner to withdraw
        if (parlay.makerWon) {
            require(isMakerNFT, "Only maker can withdraw when maker wins");
        } else {
            require(isTakerNFT, "Only taker can withdraw when maker loses");
        }

        uint256 withdrawAmount = parlay.payout;
        require(withdrawAmount > 0, "No payout to withdraw");

        // Reset payout to prevent double withdrawal
        parlay.payout = 0;

        // Transfer payout
        IERC20(config.collateralToken).safeTransfer(msg.sender, withdrawAmount);

        emit ParlayCollateralWithdrawn(tokenId, msg.sender, withdrawAmount);
    }

    function cancelExpiredOrder(
        uint256 requestId
    ) external onlyValidRequest(requestId) {
        IParlayStructs.ParlayData storage request = parlays[requestId];

        require(!request.filled, "Order already filled");
        require(request.collateral > 0, "Collateral already withdrawn");
        require(
            block.timestamp >= request.orderExpirationTime,
            "Order not expired yet"
        );
        require(
            msg.sender == request.maker,
            "Only maker can cancel expired order"
        );

        uint256 collateral = request.collateral;
        address maker = request.maker;

        // Reset request data
        request.collateral = 0;
        request.payout = 0;
        request.maker = address(0);

        // Remove request from unfilled orders
        unfilledOrders.remove(requestId);

        // Remove request from maker's orders
        ordersByMaker[maker].remove(requestId);

        // Return collateral to maker
        IERC20(config.collateralToken).safeTransfer(maker, collateral);

        emit OrderExpired(requestId, maker, collateral);
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
        uint256 parlayId = _getParlayId(tokenId);
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

    function _getParlayId(
        uint256 tokenId
    ) internal view returns (uint256 parlayId) {
        // Check if it's a maker NFT
        parlayId = makerNftToParlayId[tokenId];
        if (parlayId != 0) {
            return parlayId;
        }

        // Check if it's a taker NFT
        parlayId = takerNftToParlayId[tokenId];
        if (parlayId != 0) {
            return parlayId;
        }

        // Not found
        return 0;
    }

    function _isRequest(uint256 id) internal view returns (bool) {
        return parlays[id].maker != address(0) && !parlays[id].filled;
    }

    function _isParlay(uint256 id) internal view returns (bool) {
        return
            parlays[id].maker != address(0) &&
            parlays[id].taker != address(0) &&
            parlays[id].filled;
    }

    function _isYesNoMarket(
        IParlayStructs.Market memory market
    ) internal view returns (bool) {
        // Validate market address
        require(
            market.marketGroup != address(0),
            "Invalid market group address"
        );

        // Get the specific market data from the Sapience market group
        (ISapienceStructs.MarketData memory marketData, ) = ISapience(
            market.marketGroup
        ).getMarket(market.marketId);

        // Check if this is a Yes/No market by examining the claimStatementNo
        // If claimStatementNo is not empty, it's a Yes/No market
        // If claimStatementNo is empty, it's a numeric market
        return marketData.claimStatementNo.length > 0;
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
}
