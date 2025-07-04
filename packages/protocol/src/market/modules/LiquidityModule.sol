// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/ERC721EnumerableStorage.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../storage/Position.sol";
import "../storage/Market.sol";
import "../storage/MarketGroup.sol";
import {ISapiencePositionEvents} from "../interfaces/ISapiencePositionEvents.sol";
import {ISapienceStructs} from "../interfaces/ISapienceStructs.sol";
import {ILiquidityModule} from "../interfaces/ILiquidityModule.sol";
import {Pool} from "../libraries/Pool.sol";
import {DecimalMath} from "../libraries/DecimalMath.sol";
import {INonfungiblePositionManager} from "../interfaces/external/INonfungiblePositionManager.sol";
import {Errors} from "../storage/Errors.sol";
import {ERC721Storage} from "../storage/ERC721Storage.sol";
import {TickMath} from "../external/univ3/TickMath.sol";
import {LiquidityAmounts} from "../external/univ3/LiquidityAmounts.sol";
import {FullMath} from "../external/univ3/FullMath.sol";
import {Trade} from "../storage/Trade.sol";

contract LiquidityModule is ReentrancyGuardUpgradeable, ILiquidityModule {
    using Position for Position.Data;
    using Market for Market.Data;
    using MarketGroup for MarketGroup.Data;
    using DecimalMath for uint256;

    struct DecreaseLiquidityPositionStack {
        uint256 previousAmount0;
        uint256 previousAmount1;
        int24 lowerTick;
        int24 upperTick;
        uint128 previousLiquidity;
        INonfungiblePositionManager.DecreaseLiquidityParams decreaseParams;
        uint256 tokensOwed0;
        uint256 tokensOwed1;
        bool isFeeCollector;
        uint256 requiredCollateralAmount;
        uint256 newCollateralAmount;
        uint256 loanAmount0;
        uint256 loanAmount1;
    }

    struct IncreaseLiquidityPositionStack {
        uint256 previousAmount0;
        uint256 previousAmount1;
        int24 lowerTick;
        int24 upperTick;
        uint128 previousLiquidity;
        INonfungiblePositionManager.IncreaseLiquidityParams increaseParams;
        uint256 tokensOwed0;
        uint256 tokensOwed1;
        bool isFeeCollector;
        uint256 requiredCollateralAmount;
        uint256 loanAmount0;
        uint256 loanAmount1;
    }

    function createLiquidityPosition(ISapienceStructs.LiquidityMintParams calldata params)
        external
        override
        nonReentrant
        returns (
            uint256 id,
            uint256 requiredCollateralAmount,
            uint256 totalDepositedCollateralAmount,
            uint256 uniswapNftId,
            uint128 liquidity,
            uint256 addedAmount0,
            uint256 addedAmount1
        )
    {
        if (params.deadline < block.timestamp) {
            revert Errors.TransactionExpired(params.deadline, block.timestamp);
        }

        id = ERC721EnumerableStorage.totalSupply() + 1;
        Position.Data storage position = Position.createValid(id);
        if (!ERC721Storage._checkOnERC721Received(address(this), msg.sender, id, "")) {
            revert Errors.InvalidTransferRecipient(msg.sender);
        }
        ERC721Storage._mint(msg.sender, id);

        MarketGroup.Data storage marketGroup = MarketGroup.load();
        Market.Data storage market = Market.loadValid(params.marketId);
        market.validateLpRequirements(params.lowerTick, params.upperTick);

        uint256 normalizedCollateral = marketGroup.normalizeCollateralAmount(params.collateralAmount);

        (uniswapNftId, liquidity, addedAmount0, addedAmount1) = INonfungiblePositionManager(
            marketGroup.marketParams.uniswapPositionManager
        ).mint(
            INonfungiblePositionManager.MintParams({
                token0: address(market.baseToken),
                token1: address(market.quoteToken),
                fee: marketGroup.marketParams.feeRate,
                tickLower: params.lowerTick,
                tickUpper: params.upperTick,
                amount0Desired: params.amountBaseToken,
                amount1Desired: params.amountQuoteToken,
                amount0Min: params.minAmountBaseToken,
                amount1Min: params.minAmountQuoteToken,
                recipient: address(this),
                deadline: params.deadline
            })
        );

        (requiredCollateralAmount, totalDepositedCollateralAmount,,) = position.updateValidLp(
            market,
            Position.UpdateLpParams({
                uniswapNftId: uniswapNftId,
                liquidity: liquidity,
                additionalCollateral: normalizedCollateral,
                additionalLoanAmount0: addedAmount0,
                additionalLoanAmount1: addedAmount1,
                lowerTick: params.lowerTick,
                upperTick: params.upperTick,
                tokensOwed0: 0,
                tokensOwed1: 0,
                isFeeCollector: marketGroup.isFeeCollector(msg.sender)
            })
        );

        int256 deltaCollateral = position.updateCollateral(totalDepositedCollateralAmount);

        _emitLiquidityPositionCreated(
            ISapiencePositionEvents.LiquidityPositionCreatedEventData({
                sender: msg.sender,
                marketId: market.id,
                positionId: position.id,
                liquidity: liquidity,
                addedAmount0: addedAmount0,
                addedAmount1: addedAmount1,
                lowerTick: params.lowerTick,
                upperTick: params.upperTick,
                positionCollateralAmount: position.depositedCollateralAmount,
                positionVquoteAmount: position.vQuoteAmount,
                positionVbaseAmount: position.vBaseAmount,
                positionBorrowedVquote: position.borrowedVQuote,
                positionBorrowedVbase: position.borrowedVBase,
                deltaCollateral: deltaCollateral
            })
        );
    }

    function decreaseLiquidityPosition(ISapienceStructs.LiquidityDecreaseParams memory params)
        external
        override
        nonReentrant
        returns (uint256 decreasedAmount0, uint256 decreasedAmount1, uint256 collateralAmount)
    {
        if (params.deadline < block.timestamp) {
            revert Errors.TransactionExpired(params.deadline, block.timestamp);
        }

        DecreaseLiquidityPositionStack memory stack;

        MarketGroup.Data storage marketGroup = MarketGroup.load();
        Position.Data storage position = Position.loadValid(params.positionId);
        Market.Data storage market = Market.loadValid(position.marketId);

        market.validateMarketNotExpired();
        position.preValidateLp();
        (stack.previousAmount0, stack.previousAmount1, stack.lowerTick, stack.upperTick, stack.previousLiquidity,,) =
            Pool.getCurrentPositionTokenAmounts(market, position);

        stack.decreaseParams = INonfungiblePositionManager.DecreaseLiquidityParams({
            tokenId: position.uniswapPositionId,
            liquidity: params.liquidity,
            amount0Min: params.minBaseAmount,
            amount1Min: params.minQuoteAmount,
            deadline: params.deadline
        });

        (decreasedAmount0, decreasedAmount1) = INonfungiblePositionManager(
            marketGroup.marketParams.uniswapPositionManager
        ).decreaseLiquidity(stack.decreaseParams);

        // if all liquidity is removed, close the position and return
        if (params.liquidity == stack.previousLiquidity) {
            return _closeLiquidityPosition(market, position, false, 0);
        }

        // otherwise, validate the decreased liquidity and update the position
        // get tokens owed
        (,,,,,,,,,, stack.tokensOwed0, stack.tokensOwed1) = INonfungiblePositionManager(
            marketGroup.marketParams.uniswapPositionManager
        ).positions(position.uniswapPositionId);

        stack.isFeeCollector = marketGroup.isFeeCollector(msg.sender);
        (stack.requiredCollateralAmount, stack.newCollateralAmount, stack.loanAmount0, stack.loanAmount1) = position
            .updateValidLp(
            market,
            Position.UpdateLpParams({
                uniswapNftId: position.uniswapPositionId,
                liquidity: stack.previousLiquidity - params.liquidity,
                additionalCollateral: 0,
                additionalLoanAmount0: 0,
                additionalLoanAmount1: 0,
                lowerTick: stack.lowerTick,
                upperTick: stack.upperTick,
                tokensOwed0: stack.tokensOwed0, // decreased token0 + any fees accrued
                tokensOwed1: stack.tokensOwed1, // decreased token1 + any fees accrued
                isFeeCollector: stack.isFeeCollector
            })
        );

        // return collateral that isn't required when decreasing position
        // this is checked in updateValidLp but ignored when feeCollector
        // so we add the check here and return any excess collateral
        int256 deltaCollateral;
        if (stack.newCollateralAmount > stack.requiredCollateralAmount) {
            deltaCollateral = position.updateCollateral(stack.requiredCollateralAmount);
            collateralAmount = stack.requiredCollateralAmount;
        } else {
            collateralAmount = stack.newCollateralAmount;
        }

        _emitLiquidityPositionDecreased(
            ISapiencePositionEvents.LiquidityPositionDecreasedEventData({
                sender: msg.sender,
                marketId: market.id,
                positionId: position.id,
                requiredCollateralAmount: stack.requiredCollateralAmount,
                liquidity: params.liquidity,
                decreasedAmount0: decreasedAmount0,
                decreasedAmount1: decreasedAmount1,
                loanAmount0: stack.loanAmount0,
                loanAmount1: stack.loanAmount1,
                positionCollateralAmount: position.depositedCollateralAmount,
                positionVquoteAmount: position.vQuoteAmount,
                positionVbaseAmount: position.vBaseAmount,
                positionBorrowedVquote: position.borrowedVQuote,
                positionBorrowedVbase: position.borrowedVBase,
                deltaCollateral: deltaCollateral
            })
        );
    }

    function closeLiquidityPosition(ISapienceStructs.LiquidityCloseParams memory params)
        external
        override
        nonReentrant
        returns (uint256 decreasedAmount0, uint256 decreasedAmount1, uint256 collateralAmount)
    {
        if (params.deadline < block.timestamp) {
            revert Errors.TransactionExpired(params.deadline, block.timestamp);
        }

        if (params.liquiditySlippage > DecimalMath.UNIT || params.tradeSlippage > DecimalMath.UNIT) {
            revert Errors.InvalidSlippage(params.liquiditySlippage, params.tradeSlippage);
        }

        DecreaseLiquidityPositionStack memory stack;

        MarketGroup.Data storage marketGroup = MarketGroup.load();
        Position.Data storage position = Position.loadValid(params.positionId);
        Market.Data storage market = Market.loadValid(position.marketId);

        market.validateMarketNotExpired();
        position.preValidateLp();
        (stack.previousAmount0, stack.previousAmount1, stack.lowerTick, stack.upperTick, stack.previousLiquidity,,) =
            Pool.getCurrentPositionTokenAmounts(market, position);

        stack.decreaseParams = INonfungiblePositionManager.DecreaseLiquidityParams({
            tokenId: position.uniswapPositionId,
            liquidity: stack.previousLiquidity,
            amount0Min: stack.previousAmount0.mulDecimal(DecimalMath.UNIT - params.liquiditySlippage),
            amount1Min: stack.previousAmount1.mulDecimal(DecimalMath.UNIT - params.liquiditySlippage),
            deadline: params.deadline
        });

        (decreasedAmount0, decreasedAmount1) = INonfungiblePositionManager(
            marketGroup.marketParams.uniswapPositionManager
        ).decreaseLiquidity(stack.decreaseParams);

        return _closeLiquidityPosition(market, position, true, params.tradeSlippage);
    }

    function increaseLiquidityPosition(ISapienceStructs.LiquidityIncreaseParams memory params)
        external
        nonReentrant
        returns (
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1,
            uint256 requiredCollateralAmount,
            uint256 totalDepositedCollateralAmount
        )
    {
        if (params.deadline < block.timestamp) {
            revert Errors.TransactionExpired(params.deadline, block.timestamp);
        }

        IncreaseLiquidityPositionStack memory stack;

        MarketGroup.Data storage marketGroup = MarketGroup.load();
        Position.Data storage position = Position.loadValid(params.positionId);
        Market.Data storage market = Market.loadValid(position.marketId);

        market.validateMarketNotExpired();
        position.preValidateLp();

        (stack.previousAmount0, stack.previousAmount1, stack.lowerTick, stack.upperTick, stack.previousLiquidity,,) =
            Pool.getCurrentPositionTokenAmounts(market, position);

        stack.increaseParams = INonfungiblePositionManager.IncreaseLiquidityParams({
            tokenId: position.uniswapPositionId,
            amount0Desired: params.baseTokenAmount,
            amount1Desired: params.quoteTokenAmount,
            amount0Min: params.minBaseAmount,
            amount1Min: params.minQuoteAmount,
            deadline: params.deadline
        });

        (liquidity, amount0, amount1) = INonfungiblePositionManager(marketGroup.marketParams.uniswapPositionManager)
            .increaseLiquidity(stack.increaseParams);

        // get tokens owed
        (,,,,,,,,,, stack.tokensOwed0, stack.tokensOwed1) = INonfungiblePositionManager(
            marketGroup.marketParams.uniswapPositionManager
        ).positions(position.uniswapPositionId);

        stack.isFeeCollector = marketGroup.isFeeCollector(msg.sender);
        (requiredCollateralAmount, totalDepositedCollateralAmount, stack.loanAmount0, stack.loanAmount1) = position
            .updateValidLp(
            market,
            Position.UpdateLpParams({
                uniswapNftId: position.uniswapPositionId,
                liquidity: stack.previousLiquidity + liquidity,
                additionalCollateral: marketGroup.normalizeCollateralAmount(params.collateralAmount),
                additionalLoanAmount0: amount0, // these are the added tokens to the position
                additionalLoanAmount1: amount1,
                lowerTick: stack.lowerTick,
                upperTick: stack.upperTick,
                tokensOwed0: stack.tokensOwed0,
                tokensOwed1: stack.tokensOwed1,
                isFeeCollector: stack.isFeeCollector
            })
        );

        int256 deltaCollateral = position.updateCollateral(totalDepositedCollateralAmount);

        _emitLiquidityPositionIncreased(
            ISapiencePositionEvents.LiquidityPositionIncreasedEventData({
                sender: msg.sender,
                marketId: market.id,
                positionId: position.id,
                requiredCollateralAmount: stack.requiredCollateralAmount,
                liquidity: liquidity,
                increasedAmount0: amount0,
                increasedAmount1: amount1,
                loanAmount0: stack.loanAmount0,
                loanAmount1: stack.loanAmount1,
                positionCollateralAmount: position.depositedCollateralAmount,
                positionVquoteAmount: position.vQuoteAmount,
                positionVbaseAmount: position.vBaseAmount,
                positionBorrowedVquote: position.borrowedVQuote,
                positionBorrowedVbase: position.borrowedVBase,
                deltaCollateral: deltaCollateral
            })
        );
    }

    struct QuoteCollateralStack {
        int24 lowerTick;
        int24 upperTick;
        uint128 currentLiquidity;
        uint256 tokensOwed0;
        uint256 tokensOwed1;
        uint160 sqrtPriceX96;
        uint160 sqrtPriceAX96;
        uint160 sqrtPriceBX96;
        uint256 finalLoanAmount0;
        uint256 finalLoanAmount1;
        uint256 amount0;
        uint256 amount1;
    }

    function quoteRequiredCollateral(uint256 positionId, uint128 liquidity)
        external
        view
        override
        returns (uint256 requiredCollateral)
    {
        Position.Data storage position = Position.loadValid(positionId);
        Market.Data storage market = Market.loadValid(position.marketId);
        MarketGroup.Data storage marketGroup = MarketGroup.load();

        QuoteCollateralStack memory stack;

        (,,,,, stack.lowerTick, stack.upperTick, stack.currentLiquidity,,, stack.tokensOwed0, stack.tokensOwed1) =
        INonfungiblePositionManager(marketGroup.marketParams.uniswapPositionManager).positions(
            position.uniswapPositionId
        );

        (stack.sqrtPriceX96,,,,,,) = market.pool.slot0();

        stack.sqrtPriceAX96 = TickMath.getSqrtRatioAtTick(stack.lowerTick);
        stack.sqrtPriceBX96 = TickMath.getSqrtRatioAtTick(stack.upperTick);

        stack.finalLoanAmount0 = position.borrowedVBase;
        stack.finalLoanAmount1 = position.borrowedVQuote;

        if (liquidity > stack.currentLiquidity) {
            (stack.amount0, stack.amount1) = LiquidityAmounts.getAmountsForLiquidity(
                stack.sqrtPriceX96, stack.sqrtPriceAX96, stack.sqrtPriceBX96, liquidity - stack.currentLiquidity
            );
            stack.finalLoanAmount0 += stack.amount0;
            stack.finalLoanAmount1 += stack.amount1;
        } else {
            (stack.amount0, stack.amount1) = LiquidityAmounts.getAmountsForLiquidity(
                stack.sqrtPriceX96, stack.sqrtPriceAX96, stack.sqrtPriceBX96, stack.currentLiquidity - liquidity
            );
            stack.tokensOwed0 += stack.amount0;
            stack.tokensOwed1 += stack.amount1;
        }

        return market.requiredCollateralForLiquidity(
            liquidity,
            stack.finalLoanAmount0,
            stack.finalLoanAmount1,
            stack.tokensOwed0,
            stack.tokensOwed1,
            stack.sqrtPriceAX96,
            stack.sqrtPriceBX96
        );
    }

    function quoteLiquidityPositionTokens(
        uint256 marketId,
        uint256 depositedCollateralAmount,
        uint160 sqrtPriceX96,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    ) external view override returns (uint256 amount0, uint256 amount1, uint128 liquidity) {
        Market.Data storage market = Market.load(marketId);

        // calculate for unit
        uint128 unitLiquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96, DecimalMath.UNIT, DecimalMath.UNIT
        );

        (uint256 unitAmount0, uint256 unitAmount1) =
            LiquidityAmounts.getAmountsForLiquidity(sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96, unitLiquidity);

        uint256 requiredCollateral = market.requiredCollateralForLiquidity(
            unitLiquidity, unitAmount0, unitAmount1, 0, 0, sqrtPriceAX96, sqrtPriceBX96
        );

        // scale up for fractional collateral ratio
        uint256 collateralRatio = FullMath.mulDiv(
            depositedCollateralAmount,
            DecimalMath.UNIT, // Create MathUtil and use UNIT
            requiredCollateral
        );

        // scale up liquidity by collateral amount
        return (
            FullMath.mulDiv(unitAmount0, collateralRatio, DecimalMath.UNIT),
            FullMath.mulDiv(unitAmount1, collateralRatio, DecimalMath.UNIT),
            uint128((uint256(unitLiquidity) * collateralRatio) / DecimalMath.UNIT)
        );
    }

    function depositCollateral(uint256 positionId, uint256 collateralAmount) external override {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        if (!marketGroup.isFeeCollector(msg.sender)) {
            revert Errors.OnlyFeeCollector();
        }

        Position.Data storage position = Position.loadValid(positionId);
        position.validateLp();

        // add to the collateral instead of updating
        int256 deltaCollateral = position.updateCollateral(
            position.depositedCollateralAmount + marketGroup.normalizeCollateralAmount(collateralAmount)
        );

        emit ISapiencePositionEvents.CollateralDeposited(
            msg.sender,
            position.marketId,
            position.id,
            position.depositedCollateralAmount,
            position.vQuoteAmount,
            position.vBaseAmount,
            position.borrowedVQuote,
            position.borrowedVBase,
            deltaCollateral
        );
    }

    function getTokensFromLiquidity(
        uint128 liquidity,
        uint160 sqrtPriceX96,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    ) external pure override returns (uint256 amount0, uint256 amount1) {
        return LiquidityAmounts.getAmountsForLiquidity(sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96, liquidity);
    }

    function _closeLiquidityPosition(
        Market.Data storage market,
        Position.Data storage position,
        bool closeTrade,
        uint256 tradeSlippage
    ) internal returns (uint256 collectedAmount0, uint256 collectedAmount1, uint256 collateralAmount) {
        MarketGroup.Data storage marketGroup = MarketGroup.load();
        // Collect fees and remaining tokens
        (collectedAmount0, collectedAmount1) = INonfungiblePositionManager(
            marketGroup.marketParams.uniswapPositionManager
        ).collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: position.uniswapPositionId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
        // Burn the Uniswap position
        INonfungiblePositionManager(marketGroup.marketParams.uniswapPositionManager).burn(position.uniswapPositionId);
        position.uniswapPositionId = 0;

        // due to rounding on the uniswap side, 1 wei is left over on loan amount when opening & immediately closing position
        // it seems like it's always 1 wei lower than original added amount so adding it to collected amount to make sure we don't have any rounding error
        // @dev notice we are doing it only if the values are non-zero
        if (collectedAmount0 > 0) {
            collectedAmount0 += 1;
        }
        if (collectedAmount1 > 0) {
            collectedAmount1 += 1;
        }

        if (collectedAmount0 > position.borrowedVBase) {
            position.vBaseAmount = collectedAmount0 - position.borrowedVBase;
            position.borrowedVBase = 0;
        } else {
            position.borrowedVBase = position.borrowedVBase - collectedAmount0;
        }

        // recouncil with deposited collateral
        if (collectedAmount1 > position.borrowedVQuote) {
            position.depositedCollateralAmount += collectedAmount1 - position.borrowedVQuote;
            position.borrowedVQuote = 0;
        } else {
            uint256 collateralDelta = position.borrowedVQuote - collectedAmount1;
            if (position.depositedCollateralAmount < collateralDelta) {
                position.borrowedVQuote = collateralDelta;
            } else {
                position.depositedCollateralAmount -= collateralDelta;
                position.borrowedVQuote = 0;
            }
        }

        // if all debt is paid off, and no vGAS, withdraw collateral to user
        // otherwise, transition user to trader and user can trade through pool to close position
        // in a subsequent tx
        int256 deltaCollateral;
        if (position.borrowedVBase == 0 && position.vBaseAmount == 0 && position.borrowedVQuote == 0) {
            collateralAmount =
                marketGroup.withdrawCollateral(ERC721Storage._ownerOf(position.id), position.depositedCollateralAmount);
            deltaCollateral = -int256(collateralAmount);
            position.depositedCollateralAmount = 0;
            position.kind = ISapienceStructs.PositionKind.Unknown;
        } else {
            position.kind = ISapienceStructs.PositionKind.Trade;
        }

        // Emit an event for the closed position
        _emitLiquidityPositionClosed(
            ISapiencePositionEvents.LiquidityPositionClosedEventData({
                sender: msg.sender,
                marketId: market.id,
                positionId: position.id,
                positionKind: position.kind,
                collectedAmount0: collectedAmount0,
                collectedAmount1: collectedAmount1,
                loanAmount0: position.borrowedVBase,
                loanAmount1: position.borrowedVQuote,
                positionCollateralAmount: position.depositedCollateralAmount,
                positionVquoteAmount: position.vQuoteAmount,
                positionVbaseAmount: position.vBaseAmount,
                positionBorrowedVquote: position.borrowedVQuote,
                positionBorrowedVbase: position.borrowedVBase,
                deltaCollateral: deltaCollateral
            })
        );

        // Notice: closing the trade position after the event is emitted to have both events show the valid intermediate state
        if (position.kind == ISapienceStructs.PositionKind.Trade && closeTrade) {
            _closeTradePosition(market, position, tradeSlippage);
        }
    }

    function _closeTradePosition(Market.Data storage market, Position.Data storage position, uint256 tradeSlippage)
        internal
    {
        uint256 initialPrice = market.getReferencePrice();
        int256 deltaCollateralLimit =
            -int256(position.depositedCollateralAmount.mulDecimal(DecimalMath.UNIT - tradeSlippage));

        Trade.QuoteOrTradeInputParams memory inputParams = Trade.QuoteOrTradeInputParams({
            oldPosition: position,
            initialSize: position.positionSize(),
            targetSize: 0,
            deltaSize: -position.positionSize(),
            isQuote: false
        });

        // Do the trade
        Trade.QuoteOrTradeOutputParams memory outputParams = Trade.quoteOrTrade(inputParams);

        uint256 finalPrice = market.getReferencePrice();

        market.validateCurrentPoolPriceInRange();

        position.updateWithNewPosition(outputParams.position);

        // Ensures that the position only have single side tokens
        position.rebalanceVirtualTokens();

        // 1. Confirm no vgas tokens (no need to check for borrowedVGas or vGasAmount since they are zero because targetSize is zero
        // 2. Confirm collateral is enough to pay for borrowed veth (no need to check because borrowedVEth is zero because targetSize is zero)

        // 3. Reconcile collateral (again)
        position.rebalanceCollateral();

        // 4. Transfer the released collateral to the trader (pnl)
        // Notice: under normal operations, the required collateral should be zero, but if somehow there is a "bad debt" it needs to be repaid.
        int256 deltaCollateral = position.updateCollateral(outputParams.requiredCollateral);

        // 5. Set the position kind to unknown
        position.kind = ISapienceStructs.PositionKind.Unknown;

        // Check if the collateral is within the limit
        Trade.checkDeltaCollateralLimit(deltaCollateral, deltaCollateralLimit);

        _emitTraderPositionModified(
            ISapiencePositionEvents.TraderPositionModifiedEventData({
                sender: msg.sender,
                marketId: position.marketId,
                positionId: position.id,
                requiredCollateral: outputParams.requiredCollateral,
                initialPrice: initialPrice,
                finalPrice: finalPrice,
                tradeRatio: outputParams.tradeRatioD18,
                positionCollateralAmount: position.depositedCollateralAmount,
                positionVquoteAmount: position.vQuoteAmount,
                positionVbaseAmount: position.vBaseAmount,
                positionBorrowedVquote: position.borrowedVQuote,
                positionBorrowedVbase: position.borrowedVBase,
                deltaCollateral: deltaCollateral
            })
        );
    }

    function _emitLiquidityPositionCreated(ISapiencePositionEvents.LiquidityPositionCreatedEventData memory eventData)
        private
    {
        emit ISapiencePositionEvents.LiquidityPositionCreated(
            eventData.sender,
            eventData.marketId,
            eventData.positionId,
            eventData.liquidity,
            eventData.addedAmount0,
            eventData.addedAmount1,
            eventData.lowerTick,
            eventData.upperTick,
            eventData.positionCollateralAmount,
            eventData.positionVquoteAmount,
            eventData.positionVbaseAmount,
            eventData.positionBorrowedVquote,
            eventData.positionBorrowedVbase,
            eventData.deltaCollateral
        );
    }

    function _emitLiquidityPositionDecreased(
        ISapiencePositionEvents.LiquidityPositionDecreasedEventData memory eventData
    ) private {
        emit ISapiencePositionEvents.LiquidityPositionDecreased(
            eventData.sender,
            eventData.marketId,
            eventData.positionId,
            eventData.requiredCollateralAmount,
            eventData.liquidity,
            eventData.decreasedAmount0,
            eventData.decreasedAmount1,
            eventData.loanAmount0,
            eventData.loanAmount1,
            eventData.positionCollateralAmount,
            eventData.positionVquoteAmount,
            eventData.positionVbaseAmount,
            eventData.positionBorrowedVquote,
            eventData.positionBorrowedVbase,
            eventData.deltaCollateral
        );
    }

    function _emitLiquidityPositionIncreased(
        ISapiencePositionEvents.LiquidityPositionIncreasedEventData memory eventData
    ) private {
        emit ISapiencePositionEvents.LiquidityPositionIncreased(
            eventData.sender,
            eventData.marketId,
            eventData.positionId,
            eventData.requiredCollateralAmount,
            eventData.liquidity,
            eventData.increasedAmount0,
            eventData.increasedAmount1,
            eventData.loanAmount0,
            eventData.loanAmount1,
            eventData.positionCollateralAmount,
            eventData.positionVquoteAmount,
            eventData.positionVbaseAmount,
            eventData.positionBorrowedVquote,
            eventData.positionBorrowedVbase,
            eventData.deltaCollateral
        );
    }

    function _emitLiquidityPositionClosed(ISapiencePositionEvents.LiquidityPositionClosedEventData memory eventData)
        private
    {
        emit ISapiencePositionEvents.LiquidityPositionClosed(
            eventData.sender,
            eventData.marketId,
            eventData.positionId,
            eventData.positionKind,
            eventData.collectedAmount0,
            eventData.collectedAmount1,
            eventData.loanAmount0,
            eventData.loanAmount1,
            eventData.positionCollateralAmount,
            eventData.positionVquoteAmount,
            eventData.positionVbaseAmount,
            eventData.positionBorrowedVquote,
            eventData.positionBorrowedVbase,
            eventData.deltaCollateral
        );
    }

    function _emitTraderPositionModified(ISapiencePositionEvents.TraderPositionModifiedEventData memory eventData)
        internal
    {
        emit ISapiencePositionEvents.TraderPositionModified(
            eventData.sender,
            eventData.marketId,
            eventData.positionId,
            eventData.requiredCollateral,
            eventData.initialPrice,
            eventData.finalPrice,
            eventData.tradeRatio,
            eventData.positionCollateralAmount,
            eventData.positionVquoteAmount,
            eventData.positionVbaseAmount,
            eventData.positionBorrowedVquote,
            eventData.positionBorrowedVbase,
            eventData.deltaCollateral
        );
    }
}
