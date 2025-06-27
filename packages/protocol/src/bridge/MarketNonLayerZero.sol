// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.22;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IUMASettlementModule} from "../market/interfaces/IUMASettlementModule.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMarketLayerZeroBridge} from "./interfaces/ILayerZeroBridge.sol";

/**
 * @title MarketNonLayerZeroBridge
 * @notice Represents UMA without integrating LayerZero Bridge contract for Market side that:
 */
contract MarketNonLayerZeroBridge is
    Ownable,
    ReentrancyGuard
{
    // State variables
    mapping(address => bool) private enabledMarketGroups;

    mapping(uint256 => address) private assertionIdToMarketGroup; // assertionId => marketGroupAddress (where do we need to call the callback)
    uint256 private lastAssertionId; // Internal assertionId that is sent to UMA and to the marketGroup as bytes32

    // Constructor and initialization
    constructor(
        address _owner
    ) Ownable(_owner) {}


    function enableMarketGroup(
        address marketGroup
    ) external onlyOwner {
        enabledMarketGroups[marketGroup] = true;
    }

    function disableMarketGroup(
        address marketGroup
    ) external onlyOwner {
        enabledMarketGroups[marketGroup] = false;
    }

    function isMarketGroupEnabled(
        address marketGroup
    ) external view returns (bool) {
        return enabledMarketGroups[marketGroup];
    }

    function resolveAssertion(
        uint256 assertionId,
        bool verified
    ) external onlyOwner nonReentrant {
        address marketGroup = assertionIdToMarketGroup[assertionId];
        IUMASettlementModule(marketGroup).assertionResolvedCallback(
            bytes32(assertionId),
            verified
        );
    }

    function disputeAssertion(
        uint256 assertionId
    ) external onlyOwner nonReentrant {
        address marketGroup = assertionIdToMarketGroup[assertionId];
        IUMASettlementModule(marketGroup).assertionDisputedCallback(
            bytes32(assertionId)
        );
    }

    // UMA Replacement Functions
    function forwardAssertTruth(
        address marketGroup,
        uint256 marketId,
        bytes memory claim,
        address asserter, // Notice, asserter is the address of the user that deposited the bond on the other side of the bridge (UMA Side)
        uint64 liveness,
        address currency,
        uint256 bond
    ) external returns (bytes32) {
        require(
            enabledMarketGroups[msg.sender],
            "Only enabled market groups can submit"
        );

        // Advance to next assertionId
        lastAssertionId++;

        // Store the assertionId to marketGroup mapping
        assertionIdToMarketGroup[lastAssertionId] = marketGroup;

        // Emit the assertion submitted event
        emit IMarketLayerZeroBridge.AssertionSubmitted(marketGroup, marketId, lastAssertionId);

        return bytes32(lastAssertionId);
    }
}
