// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "../../external/IResolutionCallback.sol";

interface IMockVault is IResolutionCallback {
    function lastSettlementPrice() external view returns (uint256);
    function getLastSettlementPrice() external view returns (uint256);
}
