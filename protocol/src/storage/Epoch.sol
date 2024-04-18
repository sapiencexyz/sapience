// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "../interfaces/external/INonfungiblePositionManager.sol";
import "../contracts/VirtualToken.sol";
import "./Debt.sol";
import "./Errors.sol";

import "forge-std/console2.sol";

library Epoch {
    struct Data {
        uint endTime;
        INonfungiblePositionManager uniswapPositionManager;
        address resolver;
        address collateralAsset;
        uint baseAssetMinPrice;
        uint baseAssetMaxPrice;
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
        uint endTime,
        address uniswapPositionManager,
        address resolver,
        address collateralAsset,
        uint baseAssetMinPrice,
        uint baseAssetMaxPrice,
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

        epoch.endTime = endTime;
        epoch.uniswapPositionManager = INonfungiblePositionManager(
            uniswapPositionManager
        );
        epoch.resolver = resolver;
        epoch.collateralAsset = collateralAsset;
        epoch.baseAssetMinPrice = baseAssetMinPrice;
        epoch.baseAssetMaxPrice = baseAssetMaxPrice;
        epoch.feeRate = feeRate;

        epoch.ethToken = new VirtualToken(
            address(this),
            "virtual ETH Token",
            "vETH"
        );

        epoch.gasToken = new VirtualToken(
            address(this),
            "virtual GAS token",
            "vGAS"
        );

        epoch.pool = IUniswapV3Pool(
            IUniswapV3Factory(epoch.uniswapPositionManager.factory())
                .createPool(
                    address(epoch.gasToken),
                    address(epoch.ethToken),
                    feeRate
                )
        );

        console2.logAddress(address(epoch.pool));

        IUniswapV3Pool(epoch.pool).initialize(0.1414213562 ether);
    }

    function loadValid() internal view returns (Data storage epoch) {
        epoch = load();

        if (epoch.endTime == 0) {
            revert Errors.InvalidEpoch();
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
