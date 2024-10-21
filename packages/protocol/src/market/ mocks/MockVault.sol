// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "../interfaces/mocks/IMockVault.sol";
import {IERC165} from "@synthetixio/core-contracts/contracts/interfaces/IERC165.sol";

contract MockVault is IMockVault {
    uint160 public lastSettlementPrice;

    function resolutionCallback(
        uint160 previousResolutionSqrtPriceX96
    ) external override {
        lastSettlementPrice = previousResolutionSqrtPriceX96;
    }

    function getLastSettlementPrice() external view override returns (uint256) {
        return lastSettlementPrice;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165) returns (bool) {
        return
            interfaceId == type(IResolutionCallback).interfaceId ||
            interfaceId == this.supportsInterface.selector;
    }
}
