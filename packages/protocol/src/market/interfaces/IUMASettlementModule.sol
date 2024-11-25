// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

interface IUMASettlementModule {
    event SettlementSubmitted(
        uint256 epochId,
        address asserter,
        uint160 settlementSqrtPriceX96,
        uint256 submissionTime
    );
    event SettlementDisputed(uint256 epochId, uint256 disputeTime);
    event EpochSettled(
        uint256 epochId,
        bytes32 assertionId,
        uint160 settlementSqrtPriceX96
    );

    function submitSettlementPrice(
        uint256 epochId,
        address asserter,
        uint160 settlementSqrtPriceX96
    ) external returns (bytes32);

    function assertionResolvedCallback(
        bytes32 assertionId,
        bool assertedTruthfully
    ) external;

    function assertionDisputedCallback(bytes32 assertionId) external;
}
