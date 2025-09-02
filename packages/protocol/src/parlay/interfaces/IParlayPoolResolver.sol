// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IParlayStructs.sol";

/**
 * @title IParlayPoolResolver
 */
interface IParlayPoolResolver {
    function validateParlayMarkets(
        IParlayStructs.PredictedOutcome[] calldata predictedOutcomes,
        bool syncCall,
        uint256 requestId
    ) external returns (bool syncCallSucceded);
    
    function resolveParlay(
        IParlayStructs.PredictedOutcome[] calldata predictedOutcomes,
        bool syncCall,
        uint256 parlayId
    ) external returns (bool syncCallSucceded, bool makerWon);
}
