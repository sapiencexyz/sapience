// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "../libraries/DecimalMath.sol";

import "../external/VirtualToken.sol";
import "../libraries/DecimalPrice.sol";
import "../libraries/Quote.sol";
import "../external/univ3/LiquidityAmounts.sol";
import {INonfungiblePositionManager} from "../interfaces/external/INonfungiblePositionManager.sol";
import "./Debt.sol";
import "./Errors.sol";
import "./MarketGroup.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import {ISapienceStructs} from "../interfaces/ISapienceStructs.sol";

library Market {
    using DecimalMath for uint256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    struct Settlement {
        uint160 settlementPriceSqrtX96;
        uint256 submissionTime;
        bool disputed;
    }

    struct Data {
        uint256 startTime;
        uint256 endTime;
        int24 baseAssetMinPriceTick;
        int24 baseAssetMaxPriceTick;
        VirtualToken baseToken;
        VirtualToken quoteToken;
        IUniswapV3Pool pool;
        bool settled;
        uint256 settlementPriceD18;
        mapping(uint256 => Debt.Data) lpDebtPositions;
        bytes32 assertionId;
        Settlement settlement;
        ISapienceStructs.MarketParams marketParams; // snapshotting market params
        uint160 sqrtPriceMinX96;
        uint160 sqrtPriceMaxX96;
        uint256 minPriceD18;
        uint256 maxPriceD18;
        uint256 feeRateD18;
        uint256 id;
        bytes claimStatementYesOrNumeric;
        bytes claimStatementNo;
    }

    function load(uint256 id) internal pure returns (Data storage market) {
        bytes32 s = keccak256(abi.encode("sapience.market", id));

        assembly {
            market.slot := s
        }
    }

    function createValid(
        uint256 id,
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96,
        int24 baseAssetMinPriceTick,
        int24 baseAssetMaxPriceTick,
        uint256 salt,
        bytes memory claimStatementYesOrNumeric,
        bytes memory claimStatementNo
    ) internal returns (Data storage market) {
        MarketGroup.Data storage marketGroup = MarketGroup.loadValid();
        ISapienceStructs.MarketParams storage marketParams = marketGroup
            .marketParams;

        market = load(id);

        require(claimStatementYesOrNumeric.length > 0, "claimStatementYesOrNumeric must be non-empty");

        // can only be called once
        if (market.startTime != 0) {
            revert Errors.MarketAlreadyStarted();
        }

        if (startTime == 0) {
            revert Errors.StartTimeCannotBeZero();
        }

        if (endTime <= startTime) {
            revert Errors.EndTimeTooEarly(startTime, endTime);
        }

        if (
            address(market.baseToken) != address(0) ||
            address(market.quoteToken) != address(0)
        ) {
            revert Errors.TokensAlreadyCreated();
        }

        // set id on first creation
        if (market.id == 0) market.id = id;

        market.startTime = startTime;
        market.endTime = endTime;

        // claim statement is the statement that will be used to assert the truth of the market
        market.claimStatementYesOrNumeric = claimStatementYesOrNumeric;
        market.claimStatementNo = claimStatementNo;

        // copy over market parameters into market (clone them to prevent any changes to marketGroup marketParams)
        market.marketParams.feeRate = marketParams.feeRate;
        market.marketParams.assertionLiveness = marketParams.assertionLiveness;
        market.marketParams.bondCurrency = marketParams.bondCurrency;
        market.marketParams.bondAmount = marketParams.bondAmount;
        market.marketParams.uniswapPositionManager = marketParams
            .uniswapPositionManager;
        market.marketParams.uniswapSwapRouter = marketParams.uniswapSwapRouter;
        market.marketParams.uniswapQuoter = marketParams.uniswapQuoter;
        market.marketParams.optimisticOracleV3 = marketParams
            .optimisticOracleV3;

        validateMarketBounds(
            market,
            baseAssetMinPriceTick,
            baseAssetMaxPriceTick
        );
        market.baseAssetMinPriceTick = baseAssetMinPriceTick;
        market.baseAssetMaxPriceTick = baseAssetMaxPriceTick;
        market.feeRateD18 = uint256(marketParams.feeRate) * 1e12;

        // check market.marketParams.bondAmount is greater than the minimum bond for the assertion currency
        uint256 minUMABond = OptimisticOracleV3Interface(
            marketParams.optimisticOracleV3
        ).getMinimumBond(marketParams.bondCurrency);
        if (marketParams.bondAmount < minUMABond) {
            // Cap the bond amount at the minimum bond for the assertion currency
            market.marketParams.bondAmount = minUMABond;
        }
        VirtualToken tokenA = _createVirtualToken(salt, "Base Token", "vBase");
        VirtualToken tokenB = _createVirtualToken(
            salt + 1,
            "Quote Token",
            "vQuote"
        );

        if (address(tokenA) < address(tokenB)) {
            market.baseToken = tokenA;
            market.quoteToken = tokenB;
        } else {
            market.baseToken = tokenB;
            market.quoteToken = tokenA;
        }

        // create & initialize pool
        market.pool = IUniswapV3Pool(
            IUniswapV3Factory(
                INonfungiblePositionManager(
                    market.marketParams.uniswapPositionManager
                ).factory()
            ).createPool(
                    address(market.baseToken),
                    address(market.quoteToken),
                    marketParams.feeRate
                )
        );
        market.pool.initialize(startingSqrtPriceX96); // starting price

        int24 spacing = market.pool.tickSpacing();
        // store min/max prices
        market.sqrtPriceMinX96 = TickMath.getSqrtRatioAtTick(
            market.baseAssetMinPriceTick
        );
        // use next tick for max price
        market.sqrtPriceMaxX96 = TickMath.getSqrtRatioAtTick(
            market.baseAssetMaxPriceTick + spacing
        );
        market.maxPriceD18 = DecimalPrice.sqrtRatioX96ToPrice(
            market.sqrtPriceMaxX96
        );
        market.minPriceD18 = DecimalPrice.sqrtRatioX96ToPrice(
            market.sqrtPriceMinX96
        );

        // Validate starting price is within the range
        if (
            startingSqrtPriceX96 < market.sqrtPriceMinX96 ||
            startingSqrtPriceX96 > market.sqrtPriceMaxX96
        ) {
            revert Errors.InvalidStartingPrice(
                startingSqrtPriceX96,
                market.sqrtPriceMinX96,
                market.sqrtPriceMaxX96
            );
        }

        // mint max; track tokens loaned by in FAccount
        market.baseToken.mint(address(this), type(uint256).max);
        market.quoteToken.mint(address(this), type(uint256).max);

        // approve to uniswapPositionManager
        market.baseToken.approve(
            address(market.marketParams.uniswapPositionManager),
            type(uint256).max
        );
        market.quoteToken.approve(
            address(market.marketParams.uniswapPositionManager),
            type(uint256).max
        );

        // approve to uniswapSwapRouter
        market.baseToken.approve(
            address(market.marketParams.uniswapSwapRouter),
            type(uint256).max
        );
        market.quoteToken.approve(
            address(market.marketParams.uniswapSwapRouter),
            type(uint256).max
        );
    }

    function _createVirtualToken(
        uint256 initialSalt,
        string memory name,
        string memory symbol
    ) private returns (VirtualToken token) {
        uint256 currentSalt = initialSalt;
        uint256 currentBlockNumber = block.number;
        while (true) {
            bytes32 salt = keccak256(
                abi.encodePacked(
                    currentSalt,
                    currentBlockNumber,
                    block.coinbase
                )
            );
            try
                new VirtualToken{salt: bytes32(salt)}(
                    address(this),
                    name,
                    symbol
                )
            returns (VirtualToken _token) {
                return _token;
            } catch {
                currentSalt++;
                currentBlockNumber++;
            }
        }
    }

    function loadValid(uint256 id) internal view returns (Data storage market) {
        market = load(id);

        if (market.endTime == 0) {
            revert Errors.InvalidMarket();
        }
    }

    function validateLpRequirements(
        Data storage self,
        int24 lowerTick,
        int24 upperTick
    ) internal view {
        validateMarketNotExpired(self);

        int24 minTick = self.baseAssetMinPriceTick;
        int24 maxTick = self.baseAssetMaxPriceTick;
        if (lowerTick < minTick) revert Errors.InvalidRange(lowerTick, minTick);
        if (upperTick > maxTick) revert Errors.InvalidRange(upperTick, maxTick);
    }

    function validateMarketNotExpired(Data storage self) internal view {
        if (self.settled || block.timestamp >= self.endTime) {
            revert Errors.ExpiredMarket();
        }
    }

    function validateNotSettled(Data storage self) internal view {
        if (block.timestamp >= self.endTime && !self.settled) {
            revert Errors.ExpiredMarketNotSettled(self.endTime);
        }

        if (self.settled) {
            revert Errors.MarketSettled();
        }
    }

    function validateMarketBounds(
        Data storage self,
        int24 minPriceTick,
        int24 maxPriceTick
    ) internal view {
        int24 tickSpacing = getTickSpacingForFee(self.marketParams.feeRate);
        if (minPriceTick % tickSpacing != 0) {
            revert Errors.InvalidBaseAssetMinPriceTick(
                minPriceTick,
                tickSpacing
            );
        }

        if (maxPriceTick % tickSpacing != 0) {
            revert Errors.InvalidBaseAssetMaxPriceTick(
                maxPriceTick,
                tickSpacing
            );
        }

        if (minPriceTick >= maxPriceTick) {
            revert Errors.InvalidPriceTickRange(minPriceTick, maxPriceTick);
        }
    }

    /**
     * @notice Gets the required collateral amount to cover the loan amounts
     *
     * @param self Market storage
     * @param ownedBaseAmount Amount of base token owned by the trader
     * @param ownedQuoteAmount Amount of quote token owned by the trader
     * @param loanBaseAmount Amount of base token loaned by the trader
     * @param loanQuoteAmount Amount of quote token loaned by the trader
     */
    function getCollateralRequirementsForTrade(
        Data storage self,
        uint256 ownedBaseAmount,
        uint256 ownedQuoteAmount,
        uint256 loanBaseAmount,
        uint256 loanQuoteAmount
    ) internal view returns (uint256 requiredCollateral) {
        uint256 requiredCollateralAtMinPrice = getCollateralRequiredAtPrice(
            self,
            ownedBaseAmount,
            ownedQuoteAmount,
            loanBaseAmount,
            loanQuoteAmount,
            self.minPriceD18
        );

        uint256 requiredCollateralAtMaxPrice = getCollateralRequiredAtPrice(
            self,
            ownedBaseAmount,
            ownedQuoteAmount,
            loanBaseAmount,
            loanQuoteAmount,
            self.maxPriceD18
        );

        requiredCollateral = requiredCollateralAtMinPrice >
            requiredCollateralAtMaxPrice
            ? requiredCollateralAtMinPrice
            : requiredCollateralAtMaxPrice;
    }

    /**
     * @notice Validates that the provided collateral amount is sufficient to cover the loan amounts
     * @notice will revert if not enough collateral is provided
     *
     * @param self Market storage
     * @param collateralAmount Amount of collateral provided
     * @param ownedBaseAmount Amount of base token owned by the trader
     * @param ownedQuoteAmount Amount of quote token owned by the trader
     * @param loanBaseAmount Amount of base token loaned by the trader
     * @param loanQuoteAmount Amount of quote token loaned by the trader
     */
    function validateCollateralRequirementsForTrade(
        Data storage self,
        uint256 collateralAmount,
        uint256 ownedBaseAmount,
        uint256 ownedQuoteAmount,
        uint256 loanBaseAmount,
        uint256 loanQuoteAmount
    ) internal view {
        validateOwnedAndDebtAtPrice(
            self,
            collateralAmount,
            ownedBaseAmount,
            ownedQuoteAmount,
            loanBaseAmount,
            loanQuoteAmount,
            self.minPriceD18
        );

        validateOwnedAndDebtAtPrice(
            self,
            collateralAmount,
            ownedBaseAmount,
            ownedQuoteAmount,
            loanBaseAmount,
            loanQuoteAmount,
            self.maxPriceD18
        );
    }

    function getCollateralRequiredAtPrice(
        Data storage self,
        uint256 ownedBaseAmount,
        uint256 ownedQuoteAmount,
        uint256 loanBaseAmount,
        uint256 loanQuoteAmount,
        uint256 price
    ) internal view returns (uint256 requiredCollateral) {
        uint256 baseAmount;
        uint256 quoteAmount;
        uint256 baseDebt;
        uint256 quoteDebt;

        // Consolidate to only trade what is needed
        if (ownedBaseAmount > loanBaseAmount) {
            baseAmount = ownedBaseAmount - loanBaseAmount;
            baseDebt = 0;
        } else {
            baseAmount = 0;
            baseDebt = loanBaseAmount - ownedBaseAmount;
        }

        if (ownedQuoteAmount > loanQuoteAmount) {
            quoteAmount = ownedQuoteAmount - loanQuoteAmount;
            quoteDebt = 0;
        } else {
            quoteAmount = 0;
            quoteDebt = loanQuoteAmount - ownedQuoteAmount;
        }

        // Get total debt
        uint256 adjustedPrice = self.settled
            ? price
            : price.mulDecimal((DecimalMath.UNIT + self.feeRateD18));
        uint256 totalDebtValue = Quote.quoteBaseToQuoteWithPrice(
            baseDebt,
            adjustedPrice
        ) + quoteDebt;

        // Get total credit
        adjustedPrice = self.settled
            ? price
            : price.mulDecimal((DecimalMath.UNIT - self.feeRateD18));
        uint256 totalOwnedValue = Quote.quoteBaseToQuoteWithPrice(
            baseAmount,
            adjustedPrice
        ) + quoteAmount;

        requiredCollateral = totalDebtValue > totalOwnedValue
            ? totalDebtValue - totalOwnedValue
            : 0;

        // Adding 2 wei to prevent round up errors if greater than 0. Insignificant amount for normal operations but to prevent potential issues
        if (requiredCollateral > 0) requiredCollateral += 2;
    }

    function validateOwnedAndDebtAtPrice(
        Data storage self,
        uint256 collateralAmount,
        uint256 ownedBaseAmount,
        uint256 ownedQuoteAmount,
        uint256 loanBaseAmount,
        uint256 loanQuoteAmount,
        uint256 price
    ) internal view {
        uint256 requiredCollateral = getCollateralRequiredAtPrice(
            self,
            ownedBaseAmount,
            ownedQuoteAmount,
            loanBaseAmount,
            loanQuoteAmount,
            price
        );

        if (requiredCollateral > collateralAmount) {
            revert Errors.InsufficientCollateral(
                requiredCollateral,
                collateralAmount
            );
        }
    }

    function getCurrentPoolPriceSqrtX96(
        Data storage self
    ) internal view returns (uint160 sqrtPriceX96) {
        (sqrtPriceX96, , , , , , ) = self.pool.slot0();
    }

    function getCurrentPoolPrice(
        Data storage self
    ) internal view returns (uint256 decimalPrice) {
        uint160 sqrtPriceX96 = getCurrentPoolPriceSqrtX96(self);

        return DecimalPrice.sqrtRatioX96ToPrice(sqrtPriceX96);
    }

    function validateCurrentPoolPriceInRange(Data storage self) internal view {
        (uint160 sqrtPriceX96, , , , , , ) = self.pool.slot0();

        validatePriceInRange(self, sqrtPriceX96);
    }

    function validatePriceInRange(
        Data storage self,
        uint160 priceX96
    ) internal view {
        if (
            priceX96 < self.sqrtPriceMinX96 || priceX96 > self.sqrtPriceMaxX96
        ) {
            revert Errors.PoolPriceOutOfRange(
                priceX96,
                self.sqrtPriceMinX96,
                self.sqrtPriceMaxX96
            );
        }
    }

    function requiredCollateralForLiquidity(
        Data storage self,
        uint128 liquidity,
        uint256 loanAmount0,
        uint256 loanAmount1,
        uint256 tokensOwed0,
        uint256 tokensOwed1,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    ) internal view returns (uint256 requiredCollateral) {
        // Note: +1 to prevent rounding errors when calculating collateral requirements inside collateralRequirementAtMinTick and collateralRequirementAtMaxTick
        uint256 collateralRequirementAtMin = collateralRequirementAtMinTick(
            self,
            liquidity,
            sqrtPriceAX96,
            sqrtPriceBX96,
            loanAmount0 + 1,
            loanAmount1 + 1,
            tokensOwed0,
            tokensOwed1
        );
        uint256 collateralRequirementAtMax = collateralRequirementAtMaxTick(
            self,
            liquidity,
            sqrtPriceAX96,
            sqrtPriceBX96,
            loanAmount0 + 1,
            loanAmount1 + 1,
            tokensOwed0,
            tokensOwed1
        );
        requiredCollateral = collateralRequirementAtMin >
            collateralRequirementAtMax
            ? collateralRequirementAtMin
            : collateralRequirementAtMax;

        // Adding 2 wei to prevent round up errors. Insignificant amount for normal operations but to prevent potential issues
        if (requiredCollateral > 0) {
            requiredCollateral += 2;
        }
    }

    function collateralRequirementAtMinTick(
        Data storage self,
        uint128 liquidity,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96,
        uint256 loanAmount0,
        uint256 loanAmount1,
        uint256 tokensOwed0,
        uint256 tokensOwed1
    ) internal view returns (uint256) {
        uint256 maxAmount0 = LiquidityAmounts.getAmount0ForLiquidity(
            sqrtPriceAX96,
            sqrtPriceBX96,
            liquidity
        );

        uint256 liquidityAmount0ConvertedTo1 = Quote.quoteBaseToQuoteWithPrice(
            maxAmount0,
            self.minPriceD18
        );

        uint256 creditQuote = liquidityAmount0ConvertedTo1 + tokensOwed1;
        uint256 debitQuote = loanAmount1;

        // Adjust debit or credit with new loan amount balance
        if (loanAmount0 > tokensOwed0) {
            uint256 net0ConvertedTo1 = Quote.quoteBaseToQuoteWithPrice(
                loanAmount0 - tokensOwed0,
                self.minPriceD18
            );

            debitQuote += net0ConvertedTo1;
        } else {
            uint256 net0ConvertedTo1 = Quote.quoteBaseToQuoteWithPrice(
                tokensOwed0 - loanAmount0,
                self.minPriceD18
            );

            creditQuote += net0ConvertedTo1;
        }

        return debitQuote > creditQuote ? debitQuote - creditQuote : 0;
    }

    function collateralRequirementAtMaxTick(
        Data storage self,
        uint128 liquidity,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96,
        uint256 loanAmount0,
        uint256 loanAmount1,
        uint256 tokensOwed0,
        uint256 tokensOwed1
    ) internal view returns (uint256) {
        uint256 maxAmount1 = LiquidityAmounts.getAmount1ForLiquidity(
            sqrtPriceAX96,
            sqrtPriceBX96,
            liquidity
        );

        uint256 creditQuote = maxAmount1 + tokensOwed1;
        uint256 debitQuote = loanAmount1;

        // Adjust debit or credit with new loan amount balance
        if (loanAmount0 > tokensOwed0) {
            uint256 net0ConvertedTo1 = Quote.quoteBaseToQuoteWithPrice(
                loanAmount0 - tokensOwed0,
                self.maxPriceD18
            );

            debitQuote += net0ConvertedTo1;
        } else {
            uint256 net0ConvertedTo1 = Quote.quoteBaseToQuoteWithPrice(
                tokensOwed0 - loanAmount0,
                self.minPriceD18 // Use min price to avoid profit masking an insolvent position at an intermediate tick
            );

            creditQuote += net0ConvertedTo1;
        }

        return debitQuote > creditQuote ? debitQuote - creditQuote : 0;
    }

    function setSettlementPriceInRange(
        Data storage self,
        uint256 settlementPriceD18
    ) internal returns (uint256) {
        // Special case: allow exact 0 for complete loss scenarios (e.g., "No" outcome in yes/no markets)
        if (settlementPriceD18 == 0) {
            self.settlementPriceD18 = 0;
        } else if (settlementPriceD18 > self.maxPriceD18) {
            self.settlementPriceD18 = self.maxPriceD18;
        } else if (settlementPriceD18 < self.minPriceD18) {
            self.settlementPriceD18 = self.minPriceD18;
        } else {
            self.settlementPriceD18 = settlementPriceD18;
        }

        self.settled = true;

        return self.settlementPriceD18;
    }

    function getTickSpacingForFee(uint24 fee) internal pure returns (int24) {
        if (fee == 100) {
            return 1;
        } else if (fee == 500) {
            return 10;
        } else if (fee == 3000) {
            return 60;
        } else if (fee == 10000) {
            return 200;
        } else {
            return 0;
        }
    }

    function getReferencePrice(
        Data storage self
    ) internal view returns (uint256) {
        return
            self.settled ? self.settlementPriceD18 : getCurrentPoolPrice(self);
    }
}
