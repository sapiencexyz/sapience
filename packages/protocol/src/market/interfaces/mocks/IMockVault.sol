// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "../../../vault/interfaces/IResolutionCallback.sol";
import {IERC165} from "@synthetixio/core-contracts/contracts/interfaces/IERC165.sol";

interface IMockVault is IResolutionCallback, IERC165 {
    function getLastSettlementPrice() external view returns (uint256);
}
