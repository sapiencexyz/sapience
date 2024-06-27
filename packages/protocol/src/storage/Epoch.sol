// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "../external/univ3/TickMath.sol";
import "../external/univ3/FullMath.sol";
import "../interfaces/external/INonfungiblePositionManager.sol";
import "../interfaces/external/IUniswapV3Quoter.sol";
import "../contracts/VirtualToken.sol";
import "./Debt.sol";
import "./Errors.sol";

import "forge-std/console2.sol";

library Epoch {
    struct Data {
        uint startTime;
        uint endTime;
        INonfungiblePositionManager uniswapPositionManager;
        IUniswapV3Quoter uniswapQuoter;
        address resolver;
        address collateralAsset;
        int24 baseAssetMinPriceTick;
        int24 baseAssetMaxPriceTick;
        VirtualToken ethToken;
        VirtualToken gasToken;
        IUniswapV3Pool pool;
        uint256 settlementPrice;
        uint24 feeRate;
        bool settled;
        mapping(uint256 => Debt.Data) lpDebtPositions;
    }

    function load() internal pure returns (Data storage epoch) {
        bytes32 s = keccak256(abi.encode("foil.gas.epoch"));

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
        uint startTime,
        uint endTime,
        address uniswapPositionManager,
        address uniswapQuoter,
        address resolver,
        address collateralAsset,
        int24 baseAssetMinPrice,
        int24 baseAssetMaxPrice,
        uint24 feeRate
    ) internal returns (Data storage epoch) {
        epoch = load();

        // can only be called once
        if (
            epoch.endTime != 0 ||
            address(epoch.uniswapPositionManager) != address(0)
        ) {
            revert Errors.EpochAlreadyStarted();
        }

        if (
            address(epoch.ethToken) != address(0) ||
            address(epoch.gasToken) != address(0)
        ) {
            revert Errors.TokensAlreadyCreated();
        }

        epoch.startTime = startTime;
        epoch.endTime = endTime;
        epoch.uniswapPositionManager = INonfungiblePositionManager(
            uniswapPositionManager
        );
        epoch.uniswapQuoter = IUniswapV3Quoter(uniswapQuoter);
        epoch.resolver = resolver;
        epoch.collateralAsset = collateralAsset;
        epoch.baseAssetMinPriceTick = baseAssetMinPrice;
        epoch.baseAssetMaxPriceTick = baseAssetMaxPrice;
        epoch.feeRate = feeRate;

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
            epoch.ethToken = tokenA;
            epoch.gasToken = tokenB;
        } else {
            epoch.ethToken = tokenB;
            epoch.gasToken = tokenA;
        }
        epoch.pool = IUniswapV3Pool(
            IUniswapV3Factory(epoch.uniswapPositionManager.factory())
                .createPool(
                    address(epoch.ethToken),
                    address(epoch.gasToken),
                    feeRate
                )
        );

        IUniswapV3Pool(epoch.pool).initialize(112045541949572279837463876454);
        (uint160 sqrtPriceX96, int24 tick, , , , , ) = IUniswapV3Pool(
            epoch.pool
        ).slot0();
        int24 spacing = IUniswapV3Pool(epoch.pool).tickSpacing();
        console2.log("Spacing : ", spacing);
    }

    function loadValid() internal view returns (Data storage epoch) {
        epoch = load();

        if (epoch.endTime == 0) {
            revert Errors.InvalidEpoch();
        }
    }

    function quoteGweiToGas(
        Data storage self,
        uint256 gweiAmount,
        int24 priceTick
    ) internal returns (uint256) {
        return FullMath.mulDiv(gweiAmount, 1e18, tickToPrice(priceTick));
    }

    function quoteGasToGwei(
        Data storage self,
        uint256 gasAmount,
        int24 priceTick
    ) internal returns (uint256) {
        return FullMath.mulDiv(gasAmount, tickToPrice(priceTick), 1e18);
    }

    // should move to lib
    function tickToPrice(int24 tick) internal pure returns (uint256) {
        uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);
        return (uint256(sqrtPriceX96) * uint256(sqrtPriceX96) * (1e18)) >> 96;
    }

    // function settle(Data storage self) internal {
    //     if (self.settled) {
    //         revert Errors.EpochAlreadySettled(self.id);
    //     }

    //     if (block.timestamp < self.endTime) {
    //         revert Errors.EpochNotOver(self.id);
    //     }

    //     self.settled = true;
    //     self.vGas.pause();
    //     self.vEth.pause();
    // }

    // function getCurrentPrice(
    //     Data storage self
    // ) internal view returns (uint256) {
    //     if (block.timestamp < self.startTime) {
    //         revert Errors.EpochNotStarted(self.id);
    //     }

    //     if (self.settled || block.timestamp > self.endTime) {
    //         return self.settlementPrice;
    //     }

    //     (uint160 sqrtPriceX96, , , , , , ) = self.pool.slot0();
    //     // double check formula
    //     return
    //         (uint256(sqrtPriceX96) * uint256(sqrtPriceX96) * (1e18)) >>
    //         (96 * 2);
    // }
}
