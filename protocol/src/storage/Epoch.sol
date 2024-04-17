// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import "../foil/VirtualToken.sol";
import "./Errors.sol";

library Epoch {
    struct Data {
        uint endTime;
        address uniswap;
        address resolver;
        address collateralAsset;
        uint baseAssetMinPrice;
        uint baseAssetMaxPrice;
        VirtualToken vEth;
        VirtualToken vGas;
        IUniswapV3Pool pool;
        uint256 settlementPrice;
        bool settled;
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

    function createValid(
        uint endTime,
        address uniswap,
        address resolver,
        address collateralAsset,
        uint baseAssetMinPrice,
        uint baseAssetMaxPrice
    ) internal returns (Data storage epoch) {
        epoch = load();

        // can only be called once
        if (epoch.endTime != 0) {
            revert Errors.EpochAlreadyStarted();
        }

        if (
            address(epoch.vEth) != address(0) ||
            address(epoch.vGas) != address(0)
        ) {
            revert Errors.TokensAlreadyCreated();
        }

        Data storage config = load();

        epoch.endTime = endTime;
        epoch.uniswap = uniswap;
        epoch.resolver = resolver;
        epoch.collateralAsset = collateralAsset;
        epoch.baseAssetMinPrice = baseAssetMinPrice;
        epoch.baseAssetMaxPrice = baseAssetMaxPrice;

        epoch.vEth = new VirtualToken(
            address(this),
            "virtual ETH Token",
            "vETH"
        );

        epoch.vGas = new VirtualToken(
            address(this),
            "virtual GAS token",
            "vGAS"
        );
    }

    function createPool(Data storage self, uint24 feeRate) internal {
        if (address(self.pool) != address(0)) {
            revert Errors.PoolAlreadyCreated();
        }

        self.pool = IUniswapV3Pool(
            IUniswapV3Factory(self.uniswap).createPool(
                address(self.vGas),
                address(self.vEth),
                feeRate
            )
        );
    }

    /**
     * @notice Loads an epoch from storage and checks that it is valid
     * @param epochId The ID of the epoch to load
     */
    function loadValid(
        uint256 epochId
    ) internal view returns (Data storage epoch) {
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
