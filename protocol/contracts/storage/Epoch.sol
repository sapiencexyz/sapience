// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../foil/VirtualToken.sol";
import "./Errors.sol";

library Epoch {
    struct Data {
        uint256 id;
        VirtualToken vGas;
        VirtualToken vEth;
        IUniswapV3Pool pool;
        uint256 startTime;
        uint256 endTime;
        uint256 settlementPrice;
        bool settled;
    }

    /**
     * @notice Loads an epoch from storage
     * @param epochId The ID of the epoch to load
     */
    function load(uint256 epochId) internal pure returns (Data storage epoch) {
        bytes32 s = keccak256(abi.encode("foil.gas.epoch", epochId));

        assembly {
            epoch.slot := s
        }
    }

    /**
     * @notice Loads an epoch from storage and checks that it is valid
     * @param epochId The ID of the epoch to load
     */
    function loadValid(
        uint256 epochId
    ) internal view returns (Data storage epoch) {
        epoch = load(epochId);

        if (epochId == 0 || epoch.id == 0) {
            revert Errors.InvalidId(epochId);
        }
    }

    function settle(Data storage self) internal {
        if (self.settled) {
            revert Errors.EpochAlreadySettled(self.id);
        }

        if (block.timestamp < self.endTime) {
            revert Errors.EpochNotOver(self.id);
        }

        self.settled = true;
        self.vGas.pause();
        self.vEth.pause();
    }

    function getCurrentPrice(
        Data storage self
    ) internal view returns (uint256) {
        if (block.timestamp < self.startTime) {
            revert Errors.EpochNotStarted(self.id);
        }

        if (self.settled || block.timestamp > self.endTime) {
            return self.settlementPrice;
        }

        (uint160 sqrtPriceX96, , , , , , ) = self.pool.slot0();
        // double check formula
        return
            (uint256(sqrtPriceX96) * uint256(sqrtPriceX96) * (1e18)) >>
            (96 * 2);
    }
}
