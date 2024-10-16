// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "../external/IResolutionCallback.sol";

contract MockVault is IResolutionCallback {
    uint256 public lastSettlementPrice;

    function resolutionCallback(
        uint256 previousSettlementPriceD18
    ) external override {
        lastSettlementPrice = previousSettlementPriceD18;
    }

    function getLastSettlementPrice() external view returns (uint256) {
        return lastSettlementPrice;
    }
}
