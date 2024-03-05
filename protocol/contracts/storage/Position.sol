// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "./Epoch.sol";

library Position {
    struct Data {
        uint256 id;
        Epoch.Data epoch;
        uint256 amountGwei;
        uint256 amountGas;
        uint256 priceMin;
        uint256 priceMax;
    }

    /**
     * @notice Loads a position from storage
     * @param positionId The ID of the position to load
     */
    function load(
        uint128 positionId
    ) internal pure returns (Data storage position) {
        bytes32 s = keccak256(abi.encode("foil.gas.position", positionId));

        assembly {
            position.slot := s
        }
    }

    /**
     * @notice Loads a position from storage and checks that it is valid
     * @param positionId The ID of the position to load
     */
    function loadValid(
        uint128 positionId
    ) internal view returns (Data storage position) {
        position = load(positionId);

        if (positionId == 0 || position.id == 0) {
            revert CommonErrors.InvalidId(positionId);
        }
    }
}
