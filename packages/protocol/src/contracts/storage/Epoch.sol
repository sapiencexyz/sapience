// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@uma/core/contracts/optimistic-oracle-v3/interfaces/OptimisticOracleV3Interface.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../external/univ3/TickMath.sol";
import "../external/univ3/FullMath.sol";
import "../interfaces/external/INonfungiblePositionManager.sol";
import "../interfaces/external/IUniswapV3Quoter.sol";
import "../interfaces/external/ISwapRouter.sol";
import "../external/VirtualToken.sol";
import "./Debt.sol";
import "./Errors.sol";
import "./Market.sol";

import "forge-std/console2.sol";

library Epoch {
    using SafeERC20 for IERC20;

    struct Settlement {
        uint256 settlementPrice;
        uint256 submissionTime;
        bool disputed;
        address disputer;
    }

    struct Data {
        uint startTime;
        uint endTime;
        VirtualToken ethToken;
        VirtualToken gasToken;
        IUniswapV3Pool pool;
        bool settled;
        uint256 settlementPrice;
        mapping(uint256 => Debt.Data) lpDebtPositions;
        bytes32 assertionId;
        Settlement settlement;
        Market.MarketParams marketParams; // Storing MarketParams as a struct within Epoch.Data
    }

    function load() internal pure returns (Data storage epoch) {
        // we need to have this be dynamic with IDs?
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
        address uniswapSwapRouter,
        address collateralAsset,
        uint160 startingSqrtPriceX96,
        address optimisticOracleV3,
        Market.MarketParams memory marketParams
    ) internal returns (Data storage epoch) {
        epoch = load();

        // can only be called once
        if (epoch.endTime != 0) {
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
        epoch.marketParams = marketParams;

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
        epoch.pool = IUniswapV3Pool(
            IUniswapV3Factory(
                INonfungiblePositionManager(uniswapPositionManager).factory()
            ).createPool(
                    address(epoch.gasToken),
                    address(epoch.ethToken),
                    marketParams.feeRate
                )
        );

        IUniswapV3Pool(epoch.pool).initialize(startingSqrtPriceX96); // starting price
        (uint160 sqrtPriceX96, int24 tick, , , , , ) = IUniswapV3Pool(
            epoch.pool
        ).slot0();
        int24 spacing = IUniswapV3Pool(epoch.pool).tickSpacing();

        console2.log("Spacing : ", spacing);
        console2.log("SqrtPriceX96 : ", sqrtPriceX96);
        console2.log("Tick : ", tick);

        // mint
        epoch.ethToken.mint(address(this), type(uint256).max);
        epoch.gasToken.mint(address(this), type(uint256).max);

        // approve to uniswapPositionManager
        epoch.ethToken.approve(
            address(uniswapPositionManager),
            type(uint256).max
        );
        epoch.gasToken.approve(
            address(uniswapPositionManager),
            type(uint256).max
        );

        // approve to uniswapSwapRouter
        epoch.ethToken.approve(address(uniswapSwapRouter), type(uint256).max);
        epoch.gasToken.approve(address(uniswapSwapRouter), type(uint256).max);
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

    function validateSettlmentState(Data storage self) internal {
        if (block.timestamp < self.startTime) {
            console2.log("IT SHOULD REVERT WITH EPOCH NOT STARTED");
            return;
            // revert Errors.EpochNotStarted(self.startTime);
        }

        if (block.timestamp >= self.endTime && !self.settled) {
            console2.log("IT SHOULD REVERT WITH EPOCH NOT SETTLED");
            return;
            // revert Errors.EpochNotSettled(self.endTime);
        }
    }

    function validateNotSettled(Data storage self) internal {
        if (block.timestamp < self.startTime) {
            console2.log("IT SHOULD REVERT WITH EPOCH NOT STARTED");
            return;
            // revert Errors.EpochNotStarted(self.startTime);
        }

        if (block.timestamp >= self.endTime && !self.settled) {
            console2.log("IT SHOULD REVERT WITH EPOCH NOT SETTLED");
            return;
            // revert Errors.EpochNotSettled(self.endTime);
        }

        if (self.settled) {
            console2.log("IT SHOULD REVERT WITH EPOCH SETTLED");
            return;
            // revert Errors.EpochNotSettled(self.endTime);
        }
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
