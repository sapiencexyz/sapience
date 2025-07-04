// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IMarketLayerZeroBridge} from "../../../src/bridge/interfaces/ILayerZeroBridge.sol";
import {IUMASettlementModule} from "../../../src/market/interfaces/IUMASettlementModule.sol";
import {ISapienceStructs} from "../../../src/market/interfaces/ISapienceStructs.sol";
// import {console2} from "forge-std/console2.sol";

/**
 * @title MockMarketGroup
 * @notice Mock contract that implements the UMASettlementModule interface functions
 * for testing purposes. This simulates a market group that can submit settlements
 * and receive callbacks from UMA.
 */
contract MockMarketGroup is IUMASettlementModule {
    // Storage for tracking calls and state
    struct AssertionData {
        bytes32 assertionId;
        bool resolved;
        bool disputed;
        bool assertedTruthfully;
    }

    mapping(bytes32 => AssertionData) public assertionData;

    // Track submitted settlements
    mapping(uint256 => SettlementData) public settlements;
    bytes32 public lastAssertionId;

    bytes public claim;
    uint64 public assertionLiveness;
    address public bondCurrency;
    uint256 public bondAmount;

    struct SettlementData {
        address asserter;
        uint256 submissionTime;
        bool submitted;
    }

    IMarketLayerZeroBridge public bridge;

    constructor(address _bridge) {
        bridge = IMarketLayerZeroBridge(_bridge);
    }

    function setAssertThruthData(
        bytes memory _claim,
        uint64 _assertionLiveness,
        address _bondCurrency,
        uint256 _bondAmount
    ) external {
        claim = _claim;
        assertionLiveness = _assertionLiveness;
        bondCurrency = _bondCurrency;
        bondAmount = _bondAmount;
    }

    /**
     * @notice Mock implementation of submitSettlementPrice
     * @param params The settlement price params
     * @return assertionId A mock assertion ID
     */
    function submitSettlementPrice(ISapienceStructs.SettlementPriceParams memory params)
        external
        returns (bytes32 assertionId)
    {
        assertionId = bridge.forwardAssertTruth(
            address(this), params.marketId, claim, params.asserter, assertionLiveness, bondCurrency, bondAmount
        );
        lastAssertionId = assertionId;
        assertionData[assertionId] =
            AssertionData({assertionId: assertionId, resolved: false, disputed: false, assertedTruthfully: false});
    }

    function getAssertionData(bytes32 assertionId) external view returns (AssertionData memory) {
        return assertionData[assertionId];
    }

    /**
     * @notice Mock implementation of assertionResolvedCallback
     * @param assertionId The assertion ID that was resolved
     * @param assertedTruthfully Whether the assertion was truthful
     */
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external {
        //   console2.log("assertionResolvedCallback");
        // Mark the assertion as resolved
        assertionData[assertionId].resolved = true;
        assertionData[assertionId].assertedTruthfully = assertedTruthfully;
    }

    /**
     * @notice Mock implementation of assertionDisputedCallback
     * @param assertionId The assertion ID that was disputed
     */
    function assertionDisputedCallback(bytes32 assertionId) external {
        // Mark the assertion as disputed
        assertionData[assertionId].disputed = true;
    }
}
