// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "./IERC7540.sol";
import "./IResolutionCallback.sol";

interface IVault is IERC7540, IResolutionCallback {
    function initializeFirstEpoch(
        uint256 _initialStartTime,
        uint160 _initialSqrtPriceX96
    ) external;

    function submitMarketSettlementPrice(
        uint256 epochId,
        uint160 price
    ) external returns (bytes32 assertionId);
}
