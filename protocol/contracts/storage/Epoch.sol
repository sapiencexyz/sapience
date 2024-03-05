// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../foil/VirtualToken.sol";
import "./CommonErrors.sol";

library Epoch {
    struct Data {
        uint256 id;
        VirtualToken vGas;
        VirtualToken vEth;
        IUniswapV3Pool pool;
        uint256 startTime;
        uint256 endTime;
        uint256 settlementPrice;
        bool isSettled;
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
            revert CommonErrors.InvalidId(epochId);
        }
    }
}
