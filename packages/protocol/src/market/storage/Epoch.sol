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
import "./Market.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";

library Epoch {
    using DecimalMath for uint256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    struct Settlement {
        uint160 settlementPriceD18;
        uint256 submissionTime;
        bool disputed;
    }

    struct Data {
        uint256 startTime;
        uint256 endTime;
        VirtualToken ethToken;
        VirtualToken gasToken;
        IUniswapV3Pool pool;
        bool settled;
        uint256 settlementPriceD18;
        mapping(uint256 => Debt.Data) lpDebtPositions;
        bytes32 assertionId;
        Settlement settlement;
        IFoilStructs.EpochParams params; // Storing epochParams as a struct within Epoch.Data
        uint160 sqrtPriceMinX96;
        uint160 sqrtPriceMaxX96;
        uint256 minPriceD18;
        uint256 maxPriceD18;
        uint256 feeRateD18;
        uint256 id;
    }

    function load(uint256 id) internal pure returns (Data storage epoch) {
        bytes32 s = keccak256(abi.encode("foil.gas.epoch", id));

        assembly {
            epoch.slot := s
        }
    }

    function createValid(
        uint256 id,
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96,
        uint256 salt
    ) internal returns (Data storage epoch) {
        Market.Data storage market = Market.loadValid();
        IFoilStructs.EpochParams storage epochParams = market.epochParams;

        epoch = load(id);

        // can only be called once
        if (epoch.startTime != 0) {
            revert Errors.EpochAlreadyStarted();
        }

        if (startTime < block.timestamp) {
            revert Errors.StartTimeTooEarly(startTime, block.timestamp);
        }

        if (endTime <= startTime) {
            revert Errors.EndTimeTooEarly(startTime, endTime);
        }

        if (
            address(epoch.ethToken) != address(0) ||
            address(epoch.gasToken) != address(0)
        ) {
            revert Errors.TokensAlreadyCreated();
        }

        // set id on first creation
        if (epoch.id == 0) epoch.id = id;

        epoch.startTime = startTime;
        epoch.endTime = endTime;

        // copy over market parameters into epoch (clone them to prevent any changes to market params)
        epoch.params.baseAssetMinPriceTick = epochParams.baseAssetMinPriceTick;
        epoch.params.baseAssetMaxPriceTick = epochParams.baseAssetMaxPriceTick;
        epoch.params.feeRate = epochParams.feeRate;
        epoch.params.assertionLiveness = epochParams.assertionLiveness;
        epoch.params.bondCurrency = epochParams.bondCurrency;
        epoch.params.bondAmount = epochParams.bondAmount;
        epoch.params.claimStatement = epochParams.claimStatement;
        epoch.params.uniswapPositionManager = epochParams
            .uniswapPositionManager;
        epoch.params.uniswapSwapRouter = epochParams.uniswapSwapRouter;
        epoch.params.uniswapQuoter = epochParams.uniswapQuoter;
        epoch.params.optimisticOracleV3 = epochParams.optimisticOracleV3;

        epoch.feeRateD18 = uint256(epochParams.feeRate) * 1e12;

        VirtualToken tokenA = new VirtualToken{salt: bytes32(salt)}(
            address(this),
            "Token A",
            "tknA"
        );

        VirtualToken tokenB = new VirtualToken{salt: bytes32(salt + 1)}(
            address(this),
            "Token B",
            "tknB"
        );

        if (address(tokenA) < address(tokenB)) {
            epoch.gasToken = tokenA;
            epoch.ethToken = tokenB;
        } else {
            epoch.gasToken = tokenB;
            epoch.ethToken = tokenA;
        }

        // create & initialize pool
        epoch.pool = IUniswapV3Pool(
            IUniswapV3Factory(
                INonfungiblePositionManager(
                    market.epochParams.uniswapPositionManager
                ).factory()
            ).createPool(
                    address(epoch.gasToken),
                    address(epoch.ethToken),
                    epochParams.feeRate
                )
        );
        epoch.pool.initialize(startingSqrtPriceX96); // starting price

        int24 spacing = epoch.pool.tickSpacing();
        // store min/max prices
        epoch.sqrtPriceMinX96 = TickMath.getSqrtRatioAtTick(
            epoch.params.baseAssetMinPriceTick
        );
        // use next tick for max price
        epoch.sqrtPriceMaxX96 = TickMath.getSqrtRatioAtTick(
            epoch.params.baseAssetMaxPriceTick + spacing
        );
        epoch.maxPriceD18 = DecimalPrice.sqrtRatioX96ToPrice(
            epoch.sqrtPriceMaxX96
        );
        epoch.minPriceD18 = DecimalPrice.sqrtRatioX96ToPrice(
            epoch.sqrtPriceMinX96
        );

        // mint max; track tokens loaned by in FAccount
        epoch.ethToken.mint(address(this), type(uint256).max);
        epoch.gasToken.mint(address(this), type(uint256).max);

        // approve to uniswapPositionManager
        epoch.ethToken.approve(
            address(market.epochParams.uniswapPositionManager),
            type(uint256).max
        );
        epoch.gasToken.approve(
            address(market.epochParams.uniswapPositionManager),
            type(uint256).max
        );

        // approve to uniswapSwapRouter
        epoch.ethToken.approve(
            address(market.epochParams.uniswapSwapRouter),
            type(uint256).max
        );
        epoch.gasToken.approve(
            address(market.epochParams.uniswapSwapRouter),
            type(uint256).max
        );
    }

    function loadValid(uint256 id) internal view returns (Data storage epoch) {
        epoch = load(id);

        if (epoch.endTime == 0) {
            revert Errors.InvalidEpoch();
        }
    }

    function validateLpRequirements(
        Data storage self,
        int24 lowerTick,
        int24 upperTick
    ) internal view {
        validateEpochNotExpired(self);

        int24 minTick = self.params.baseAssetMinPriceTick;
        int24 maxTick = self.params.baseAssetMaxPriceTick;
        if (lowerTick < minTick) revert Errors.InvalidRange(lowerTick, minTick);
        if (upperTick > maxTick) revert Errors.InvalidRange(upperTick, maxTick);
    }

    function validateEpochNotExpired(Data storage self) internal view {
        if (self.settled || block.timestamp >= self.endTime) {
            revert Errors.ExpiredEpoch();
        }
    }

    function validateNotSettled(Data storage self) internal view {
        if (block.timestamp >= self.endTime && !self.settled) {
            revert Errors.ExpiredEpochNotSettled(self.endTime);
        }

        if (self.settled) {
            revert Errors.EpochSettled();
        }
    }

    /**
     * @notice Gets the required collateral amount to cover the loan amounts
     *
     * @param self Epoch storage
     * @param ownedGasAmount Amount of gas owned by the trader
     * @param ownedEthAmount Amount of eth owned by the trader
     * @param loanGasAmount Amount of gas loaned by the trader
     * @param loanEthAmount Amount of eth loaned by the trader
     */
    function getCollateralRequirementsForTrade(
        Data storage self,
        uint256 ownedGasAmount,
        uint256 ownedEthAmount,
        uint256 loanGasAmount,
        uint256 loanEthAmount
    ) internal view returns (uint256 requiredCollateral) {
        uint256 requiredCollateralAtMinPrice = getCollateralRequiredAtPrice(
            self,
            ownedGasAmount,
            ownedEthAmount,
            loanGasAmount,
            loanEthAmount,
            self.minPriceD18
        );

        uint256 requiredCollateralAtMaxPrice = getCollateralRequiredAtPrice(
            self,
            ownedGasAmount,
            ownedEthAmount,
            loanGasAmount,
            loanEthAmount,
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
     * @param self Epoch storage
     * @param collateralAmount Amount of collateral provided
     * @param ownedGasAmount Amount of gas owned by the trader
     * @param ownedEthAmount Amount of eth owned by the trader
     * @param loanGasAmount Amount of gas loaned by the trader
     * @param loanEthAmount Amount of eth loaned by the trader
     */
    function validateCollateralRequirementsForTrade(
        Data storage self,
        uint256 collateralAmount,
        uint256 ownedGasAmount,
        uint256 ownedEthAmount,
        uint256 loanGasAmount,
        uint256 loanEthAmount
    ) internal view {
        validateOwnedAndDebtAtPrice(
            self,
            collateralAmount,
            ownedGasAmount,
            ownedEthAmount,
            loanGasAmount,
            loanEthAmount,
            self.minPriceD18
        );

        validateOwnedAndDebtAtPrice(
            self,
            collateralAmount,
            ownedGasAmount,
            ownedEthAmount,
            loanGasAmount,
            loanEthAmount,
            self.maxPriceD18
        );
    }

    function getCollateralRequiredAtPrice(
        Data storage self,
        uint256 ownedGasAmount,
        uint256 ownedEthAmount,
        uint256 loanGasAmount,
        uint256 loanEthAmount,
        uint256 price
    ) internal view returns (uint256 requiredCollateral) {
        uint256 gasAmount;
        uint256 ethAmount;
        uint256 gasDebt;
        uint256 ethDebt;

        // Consolidate to only trade what is needed
        if (ownedGasAmount > loanGasAmount) {
            gasAmount = ownedGasAmount - loanGasAmount;
            gasDebt = 0;
        } else {
            gasAmount = 0;
            gasDebt = loanGasAmount - ownedGasAmount;
        }

        if (ownedEthAmount > loanEthAmount) {
            ethAmount = ownedEthAmount - loanEthAmount;
            ethDebt = 0;
        } else {
            ethAmount = 0;
            ethDebt = loanEthAmount - ownedEthAmount;
        }

        // Get total debt
        uint256 adjustedPrice = self.settled
            ? price
            : price.mulDecimal((DecimalMath.UNIT + self.feeRateD18));
        uint256 totalDebtValue = Quote.quoteGasToEthWithPrice(
            gasDebt,
            adjustedPrice
        ) + ethDebt;

        // Get total credit
        adjustedPrice = self.settled
            ? price
            : price.mulDecimal((DecimalMath.UNIT - self.feeRateD18));
        uint256 totalOwnedValue = Quote.quoteGasToEthWithPrice(
            gasAmount,
            adjustedPrice
        ) + ethAmount;

        requiredCollateral = totalDebtValue > totalOwnedValue
            ? totalDebtValue - totalOwnedValue
            : 0;

        // Adding 2 wei to prevent round up errors if greater than 0. Insignificant amount for normal operations but to prevent potential issues
        if (requiredCollateral > 0) requiredCollateral += 2;
    }

    function validateOwnedAndDebtAtPrice(
        Data storage self,
        uint256 collateralAmount,
        uint256 ownedGasAmount,
        uint256 ownedEthAmount,
        uint256 loanGasAmount,
        uint256 loanEthAmount,
        uint256 price
    ) internal view {
        uint256 requiredCollateral = getCollateralRequiredAtPrice(
            self,
            ownedGasAmount,
            ownedEthAmount,
            loanGasAmount,
            loanEthAmount,
            price
        );

        if (requiredCollateral > collateralAmount) {
            revert Errors.InsufficientCollateral(
                requiredCollateral,
                collateralAmount
            );
        }
    }

    function getCurrentPoolPrice(
        Data storage self
    ) internal view returns (uint256 decimalPrice) {
        (uint160 sqrtPriceX96, , , , , , ) = self.pool.slot0();

        return DecimalPrice.sqrtRatioX96ToPrice(sqrtPriceX96);
    }

    function validateCurrentPoolPriceInRange(Data storage self) internal view {
        (uint160 sqrtPriceX96, , , , , , ) = self.pool.slot0();

        if (
            sqrtPriceX96 < self.sqrtPriceMinX96 ||
            sqrtPriceX96 > self.sqrtPriceMaxX96
        ) {
            revert Errors.PoolPriceOutOfRange(
                sqrtPriceX96,
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
        uint256 collateralRequirementAtMin = collateralRequirementAtMinTick(
            self,
            liquidity,
            sqrtPriceAX96,
            sqrtPriceBX96,
            loanAmount0,
            loanAmount1,
            tokensOwed0,
            tokensOwed1
        );
        uint256 collateralRequirementAtMax = collateralRequirementAtMaxTick(
            self,
            liquidity,
            sqrtPriceAX96,
            sqrtPriceBX96,
            loanAmount0,
            loanAmount1,
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

        uint256 liquidityAmount0ConvertedTo1 = Quote.quoteGasToEthWithPrice(
            maxAmount0,
            self.minPriceD18
        );

        uint256 creditEth = liquidityAmount0ConvertedTo1 + tokensOwed1;
        uint256 debitEth = loanAmount1;

        // Adjust debit or credit with new loan amount balance
        if (loanAmount0 > tokensOwed0) {
            uint256 net0ConvertedTo1 = Quote.quoteGasToEthWithPrice(
                loanAmount0 - tokensOwed0,
                self.minPriceD18
            );

            debitEth += net0ConvertedTo1;
        } else {
            uint256 net0ConvertedTo1 = Quote.quoteGasToEthWithPrice(
                tokensOwed0 - loanAmount0,
                self.minPriceD18
            );

            creditEth += net0ConvertedTo1;
        }

        return debitEth > creditEth ? debitEth - creditEth : 0;
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

        uint256 creditEth = maxAmount1 + tokensOwed1;
        uint256 debitEth = loanAmount1;

        // Adjust debit or credit with new loan amount balance
        if (loanAmount0 > tokensOwed0) {
            uint256 net0ConvertedTo1 = Quote.quoteGasToEthWithPrice(
                loanAmount0 - tokensOwed0,
                self.maxPriceD18
            );

            debitEth += net0ConvertedTo1;
        } else {
            uint256 net0ConvertedTo1 = Quote.quoteGasToEthWithPrice(
                tokensOwed0 - loanAmount0,
                self.minPriceD18 // Use min price to avoid profit masking an insolvent position at an intermediate tick
            );

            creditEth += net0ConvertedTo1;
        }

        return debitEth > creditEth ? debitEth - creditEth : 0;
    }

    function setSettlementPriceInRange(
        Data storage self,
        uint256 settlementPriceD18
    ) internal {
        if (settlementPriceD18 > self.maxPriceD18) {
            self.settlementPriceD18 = self.maxPriceD18;
        } else if (settlementPriceD18 < self.minPriceD18) {
            self.settlementPriceD18 = self.minPriceD18;
        } else {
            self.settlementPriceD18 = settlementPriceD18;
        }
    }
}
