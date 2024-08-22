// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

interface IEpochUMASettlementModule {
    event SettlementSubmitted(uint256 epochId, uint256 price, uint256 submissionTime);
    event SettlementDisputed(uint256 epochId, uint256 disputeTime);
    event MarketSettled(uint256 epochId, uint256 settlementPriceD18);

    function submitSettlementPrice(
        uint256 epochId,
        uint256 settlementPriceD18
    ) external returns (bytes32);

    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external;

    function assertionDisputedCallback(bytes32 assertionId) external;
}
