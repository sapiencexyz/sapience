// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

// import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "../external/VirtualToken.sol";
import "../libraries/DecimalPrice.sol";
import "../libraries/Quote.sol";
import "../external/univ3/LiquidityAmounts.sol";
import "./Debt.sol";
// import "./Errors.sol";
import "./Market.sol";

// import "forge-std/console2.sol";

library Epoch {
    struct Settlement {
        uint256 settlementPrice;
        uint256 submissionTime;
        bool disputed;
        address disputer;
    }

    struct Data {
        uint256 startTime;
        uint256 endTime;
        VirtualToken ethToken;
        VirtualToken gasToken;
        IUniswapV3Pool pool;
        bool settled;
        uint256 settlementPrice;
        mapping(uint256 => Debt.Data) lpDebtPositions;
        bytes32 assertionId;
        Settlement settlement;
        IFoilStructs.EpochParams params; // Storing epochParams as a struct within Epoch.Data
        uint160 sqrtPriceMinX96;
        uint160 sqrtPriceMaxX96;
        uint256 minPriceD18;
        uint256 maxPriceD18;
    }

    function load(uint256 id) internal pure returns (Data storage epoch) {
        bytes32 s = keccak256(abi.encode("foil.gas.epoch", id));

        assembly {
            epoch.slot := s
        }
    }

    function validateInRange(
        Data storage self,
        int24 lowerTick,
        int24 upperTick
    ) internal {
        lowerTick;
    }

    function updateDebtPosition(
        Data storage self,
        uint256 tokenId,
        uint256 tokenAmount0,
        uint256 tokenAmount1,
        uint128 liquidity
    ) internal {
        self.lpDebtPositions[tokenId] = Debt.Data({
            tokenAmount0: tokenAmount0,
            tokenAmount1: tokenAmount1,
            liquidity: liquidity
        });
    }

    function createValid(
        uint256 id,
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96
    ) internal returns (Data storage epoch) {
        Market.Data storage market = Market.loadValid();
        IFoilStructs.EpochParams storage epochParams = market.epochParams;

        epoch = load(id);

        // can only be called once
        if (epoch.startTime != 0) {
            revert Errors.EpochAlreadyStarted();
        }

        if (startTime == 0) {
            revert Errors.InvalidData("startTime");
        }

        if (endTime <= startTime) {
            revert Errors.InvalidData("endTime");
        }

        if (
            address(epoch.ethToken) != address(0) ||
            address(epoch.gasToken) != address(0)
        ) {
            revert Errors.TokensAlreadyCreated();
        }

        epoch.startTime = startTime;
        epoch.endTime = endTime;

        // copy over market parameters into epoch (clone them to prevent any changes to market params)
        epoch.params.baseAssetMinPriceTick = epochParams.baseAssetMinPriceTick;
        epoch.params.baseAssetMaxPriceTick = epochParams.baseAssetMaxPriceTick;
        epoch.params.feeRate = epochParams.feeRate;
        epoch.params.assertionLiveness = epochParams.assertionLiveness;
        epoch.params.bondCurrency = epochParams.bondCurrency;
        epoch.params.bondAmount = epochParams.bondAmount;
        epoch.params.priceUnit = epochParams.priceUnit;

        VirtualToken tokenA = new VirtualToken(
            address(this),
            "Token A",
            "tknA"
        );

        VirtualToken tokenB = new VirtualToken(
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
                INonfungiblePositionManager(market.uniswapPositionManager)
                    .factory()
            ).createPool(
                    address(epoch.gasToken),
                    address(epoch.ethToken),
                    epochParams.feeRate
                )
        );
        IUniswapV3Pool(epoch.pool).initialize(startingSqrtPriceX96); // starting price

        int24 spacing = IUniswapV3Pool(epoch.pool).tickSpacing();
        // store min/max prices
        epoch.sqrtPriceMinX96 = TickMath.getSqrtRatioAtTick(
            epoch.params.baseAssetMinPriceTick
        );
        // use next tick for max price
        epoch.sqrtPriceMaxX96 = TickMath.getSqrtRatioAtTick(
            epoch.params.baseAssetMaxPriceTick + spacing
        );
        epoch.maxPriceD18 = Quote.sqrtRatioX96ToPrice(epoch.sqrtPriceMaxX96);
        epoch.minPriceD18 = Quote.sqrtRatioX96ToPrice(epoch.sqrtPriceMinX96);

        // mint max; track tokens loaned by in FAccount
        epoch.ethToken.mint(address(this), type(uint256).max);
        epoch.gasToken.mint(address(this), type(uint256).max);

        // approve to uniswapPositionManager
        epoch.ethToken.approve(
            address(market.uniswapPositionManager),
            type(uint256).max
        );
        epoch.gasToken.approve(
            address(market.uniswapPositionManager),
            type(uint256).max
        );

        // approve to uniswapSwapRouter
        epoch.ethToken.approve(
            address(market.uniswapSwapRouter),
            type(uint256).max
        );
        epoch.gasToken.approve(
            address(market.uniswapSwapRouter),
            type(uint256).max
        );
    }

    function loadValid(uint256 id) internal view returns (Data storage epoch) {
        epoch = load(id);

        if (epoch.endTime == 0) {
            revert Errors.InvalidEpoch();
        }
    }

    function validateSettlmentState(Data storage self) internal view {
        if (block.timestamp < self.startTime) {
            revert Errors.EpochNotStarted(self.startTime);
        }

        if (block.timestamp >= self.endTime && !self.settled) {
            revert Errors.EpochNotSettled(self.endTime);
        }
    }

    function validateNotSettled(Data storage self) internal view {
        if (block.timestamp < self.startTime) {
            revert Errors.EpochNotStarted(self.startTime);
        }

        if (block.timestamp >= self.endTime && !self.settled) {
            revert Errors.EpochNotSettled(self.endTime);
        }

        if (self.settled) {
            revert Errors.EpochNotSettled(self.endTime);
        }
    }

    function validateProvidedLiquidity(
        Data storage self,
        uint256 collateralAmount,
        uint128 liquidity,
        int24 lowerTick,
        int24 upperTick
    ) internal {
        (uint160 sqrtPriceX96, , , , , , ) = self.pool.slot0();

        uint128 scaleFactor = 1e10;
        (
            uint256 requiredCollateral,
            uint256 tokenAmountA,
            uint256 tokenAmountB
        ) = requiredCollateralForLiquidity(
                self,
                liquidity / scaleFactor,
                sqrtPriceX96,
                TickMath.getSqrtRatioAtTick(lowerTick),
                TickMath.getSqrtRatioAtTick(upperTick)
            );

        requiredCollateral *= scaleFactor;

        if (collateralAmount < requiredCollateral) {
            revert Errors.InsufficientCollateral(
                collateralAmount,
                requiredCollateral
            );
        }
    }

    function requiredCollateralForLiquidity(
        Data storage self,
        uint128 liquidity,
        uint160 sqrtPriceX96,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    )
        internal
        view
        returns (
            uint256 requiredCollateral,
            uint256 loanAmount0,
            uint256 loanAmount1
        )
    {
        (loanAmount0, loanAmount1) = LiquidityAmounts.getAmountsForLiquidity(
            sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96,
            liquidity
        );

        uint256 collateralRequirementAtMin = collateralRequirementAtMinTick(
            self,
            liquidity,
            sqrtPriceAX96,
            sqrtPriceBX96,
            loanAmount0,
            loanAmount1
        );
        uint256 collateralRequirementAtMax = collateralRequirementAtMaxTick(
            self,
            liquidity,
            sqrtPriceAX96,
            sqrtPriceBX96,
            loanAmount0,
            loanAmount1
        );

        requiredCollateral = collateralRequirementAtMin >
            collateralRequirementAtMax
            ? collateralRequirementAtMin
            : collateralRequirementAtMax;
    }

    function collateralRequirementAtMinTick(
        Data storage self,
        uint128 liquidity,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96,
        uint256 loanAmount0,
        uint256 loanAmount1
    ) internal view returns (uint256) {
        uint256 maxAmount0 = LiquidityAmounts.getAmount0ForLiquidity(
            sqrtPriceAX96,
            sqrtPriceBX96,
            liquidity
        );
        uint256 availableAmount0 = maxAmount0 > loanAmount0
            ? maxAmount0 - loanAmount0
            : 0;
        uint256 availableAmount1 = Quote.quoteGasToEth(
            availableAmount0,
            self.sqrtPriceMinX96
        );
        return
            loanAmount1 > availableAmount1 ? loanAmount1 - availableAmount1 : 0;
    }

    function collateralRequirementAtMaxTick(
        Data storage self,
        uint128 liquidity,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96,
        uint256 loanAmount0,
        uint256 loanAmount1
    ) internal view returns (uint256) {
        uint256 maxAmount1 = LiquidityAmounts.getAmount1ForLiquidity(
            sqrtPriceAX96,
            sqrtPriceBX96,
            liquidity
        );

        uint256 totalLoanAmountInEth = loanAmount1 +
            Quote.quoteGasToEth(loanAmount0, self.sqrtPriceMaxX96);

        return totalLoanAmountInEth - maxAmount1;
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
        validateOwedAndDebtAtPrice(
            collateralAmount,
            ownedGasAmount,
            ownedEthAmount,
            loanGasAmount,
            loanEthAmount,
            self.sqrtPriceMinX96
        );

        validateOwedAndDebtAtPrice(
            collateralAmount,
            ownedGasAmount,
            ownedEthAmount,
            loanGasAmount,
            loanEthAmount,
            self.sqrtPriceMaxX96
        );
    }

    function validateOwedAndDebtAtPrice(
        uint256 collateralAmount,
        uint256 ownedGasAmount,
        uint256 ownedEthAmount,
        uint256 loanGasAmount,
        uint256 loanEthAmount,
        uint160 price
    ) internal pure {
        uint256 totalDebtValue = Quote.quoteGasToEth(loanGasAmount, price) +
            loanEthAmount;

        uint256 totalOwedValue = Quote.quoteGasToEth(ownedGasAmount, price) +
            ownedEthAmount +
            collateralAmount;

        if (totalDebtValue > totalOwedValue) {
            revert Errors.InsufficientCollateral(
                totalOwedValue,
                totalDebtValue
            );
        }
    }

    function getCurrentPoolPrice(
        Data storage self
    ) internal view returns (uint256 decimalPrice) {
        (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(self.pool).slot0();

        return DecimalPrice.sqrtRatioX96ToPrice(sqrtPriceX96);
    }
}
