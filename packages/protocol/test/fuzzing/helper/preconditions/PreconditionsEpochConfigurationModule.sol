// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "./PreconditionsBase.sol";

/* solhint-disable numcast/safe-cast */

abstract contract PreconditionsEpochConfigurationModule is PreconditionsBase {
    struct InitializeMarketParams {
        address owner;
        address collateralAsset;
        address uniswapPositionManager;
        address uniswapSwapRouter;
        address optimisticOracleV3;
        IFoilStructs.EpochParams epochParams;
    }

    struct CreateEpochParams {
        uint256 startTime;
        uint256 endTime;
        uint160 startingSqrtPriceX96;
    }

    function initializeMarketPreconditions(
        int24 minTick,
        int24 maxTick
    ) internal returns (InitializeMarketParams memory params) {
        if (minTick > maxTick) {
            int24 temp = minTick;
            minTick = maxTick;
            maxTick = temp;
        }

        params.owner = currentActor;
        params.collateralAsset = address(wstETH);
        params.uniswapPositionManager = address(_positionManager);
        params.uniswapSwapRouter = address(_v3SwapRouter);
        params.optimisticOracleV3 = address(uma);

        CURRENT_MIN_TICK = roundUpToNearestValidTick(minTick, 200);
        CURRENT_MAX_TICK = roundUpToNearestValidTick(maxTick, 200);

        params.epochParams = IFoilStructs.EpochParams({
            baseAssetMinPriceTick: CURRENT_MIN_TICK,
            baseAssetMaxPriceTick: CURRENT_MAX_TICK,
            feeRate: 10000, //NOTE: don't change, all other fucntion connected to tick spacing 200
            assertionLiveness: 6 hours,
            bondCurrency: address(usdc),
            bondAmount: 5000_000000,
            priceUnit: "wGwei/gas",
            uniswapPositionManager: params.uniswapPositionManager,
            uniswapSwapRouter: params.uniswapSwapRouter,
            uniswapQuoter: address(_quoter),
            optimisticOracleV3: params.optimisticOracleV3
        });
    }

    function createEpochPreconditions(
        uint160 startingSqrtPriceX96Seed
    ) internal returns (CreateEpochParams memory params) {
        params.startTime = block.timestamp;
        params.endTime = block.timestamp + 30 days;

        params.startingSqrtPriceX96 = getRandomSqrtPriceX96(
            startingSqrtPriceX96Seed,
            CURRENT_MIN_TICK,
            CURRENT_MAX_TICK
        );
    }
}
