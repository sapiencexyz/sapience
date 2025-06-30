// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {ISapienceStructs} from "./ISapienceStructs.sol";

interface IUMASettlementModule {
    event SettlementSubmitted(
        uint256 marketId,
        address asserter,
        uint160 settlementSqrtPriceX96,
        uint256 submissionTime
    );
    event SettlementDisputed(uint256 marketId, uint256 disputeTime);
    event MarketSettled(
        uint256 marketId,
        bytes32 assertionId,
        uint160 settlementSqrtPriceX96
    );

    function submitSettlementPrice(
        ISapienceStructs.SettlementPriceParams memory params
    ) external returns (bytes32);

    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external;

    function assertionDisputedCallback(bytes32 assertionId) external;
}
