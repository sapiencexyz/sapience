// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "v3-core/interfaces/IUniswapV3Pool.sol";
import "v3-core/interfaces/IUniswapV3Factory.sol";
import "../../../src/contracts/external/VirtualToken.sol";
import "../../../src/contracts/interfaces/IFoilStructs.sol";

contract MockUMA {
    // Structs from Epoch contract
    event AssertionMade(
        bytes32 indexed assertionId,
        bytes32 domainId,
        bytes claim,
        address indexed asserter,
        address callbackRecipient,
        address escalationManager,
        address caller,
        uint64 expirationTime,
        IERC20 currency,
        uint256 bond,
        bytes32 indexed identifier
    );

    event AssertionDisputed(
        bytes32 indexed assertionId,
        address indexed caller,
        address indexed disputer
    );

    event AssertionSettled(
        bytes32 indexed assertionId,
        address indexed bondRecipient,
        bool disputed,
        bool settlementResolution,
        address settleCaller
    );
    struct Settlement {
        uint256 settlementPriceD18;
        uint256 submissionTime;
        bool disputed;
        address disputer;
    }

    struct EpochParams {
        int24 baseAssetMinPriceTick;
        int24 baseAssetMaxPriceTick;
        uint24 feeRate;
        uint64 assertionLiveness;
        address bondCurrency;
        uint256 bondAmount;
        string priceUnit;
    }

    struct EpochData {
        uint256 startTime;
        uint256 endTime;
        VirtualToken ethToken;
        VirtualToken gasToken;
        IUniswapV3Pool pool;
        bool settled;
        uint256 settlementPriceD18;
        bytes32 assertionId;
        Settlement settlement;
        EpochParams params;
        uint160 sqrtPriceMinX96;
        uint160 sqrtPriceMaxX96;
        uint256 minPriceD18;
        uint256 maxPriceD18;
    }

    struct Assertion {
        EscalationManagerSettings escalationManagerSettings; // Settings related to the escalation manager.
        address asserter; // Address of the asserter.
        uint64 assertionTime; // Time of the assertion.
        bool settled; // True if the request is settled.
        IERC20 currency; // ERC20 token used to pay rewards and fees.
        uint64 expirationTime; // Unix timestamp marking threshold when the assertion can no longer be disputed.
        bool settlementResolution; // Resolution of the assertion (false till resolved).
        bytes32 domainId; // Optional domain that can be used to relate the assertion to others in the escalationManager.
        bytes32 identifier; // UMA DVM identifier to use for price requests in the event of a dispute.
        uint256 bond; // Amount of currency that the asserter has bonded.
        address callbackRecipient; // Address that receives the callback.
        address disputer; // Address of the disputer.
    }
    struct EscalationManagerSettings {
        bool arbitrateViaEscalationManager; // False if the DVM is used as an oracle (EscalationManager on True).
        bool discardOracle; // False if Oracle result is used for resolving assertion after dispute.
        bool validateDisputers; // True if the EM isDisputeAllowed should be checked on disputes.
        address assertingCaller; // Stores msg.sender when assertion was made.
        address escalationManager; // Address of the escalation manager (zero address if not configured).
    }

    mapping(bytes32 => Assertion) public assertions;
    mapping(bytes32 => bool) public assertionResults;
    bytes32 public constant defaultIdentifierValue = bytes32("TEST_IDENTIFIER");
    uint256 public constant minimumBondValue = 5000e6;

    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address escalationManager,
        uint64 liveness,
        IERC20 currency,
        uint256 bond,
        bytes32 identifier,
        bytes32 domainId
    ) external returns (bytes32) {
        require(bond >= minimumBondValue, "Bond too low");

        bytes32 assertionId = keccak256(
            abi.encodePacked(claim, block.timestamp)
        );

        assertions[assertionId] = Assertion({
            escalationManagerSettings: EscalationManagerSettings({
                arbitrateViaEscalationManager: false,
                discardOracle: false,
                validateDisputers: false,
                assertingCaller: msg.sender,
                escalationManager: escalationManager
            }),
            asserter: asserter,
            assertionTime: uint64(block.timestamp),
            settled: false,
            currency: currency,
            expirationTime: uint64(block.timestamp + liveness),
            settlementResolution: false,
            domainId: domainId,
            identifier: identifier,
            bond: bond,
            callbackRecipient: callbackRecipient,
            disputer: address(0)
        });

        emit AssertionMade(
            assertionId,
            domainId,
            claim,
            asserter,
            callbackRecipient,
            escalationManager,
            msg.sender,
            uint64(block.timestamp + liveness),
            currency,
            bond,
            identifier
        );

        return assertionId;
    }

    function mockDisputeAssertion(
        bytes32 assertionId,
        address disputer
    ) external {
        require(!assertions[assertionId].settled, "Assertion already settled");
        assertions[assertionId].disputer = disputer;
        emit AssertionDisputed(assertionId, msg.sender, disputer);

        if (assertions[assertionId].callbackRecipient != address(0)) {
            // Call the assertionDisputedCallback on the callbackRecipient
            (bool success, ) = assertions[assertionId].callbackRecipient.call(
                abi.encodeWithSignature(
                    "assertionDisputedCallback(bytes32)",
                    assertionId
                )
            );
            require(success, "Dispute callback failed");
        }
    }

    function mockSettleAssertion(
        bytes32 assertionId,
        bool settlementResolution
    ) external {
        require(!assertions[assertionId].settled, "Assertion already settled");
        assertions[assertionId].settled = true;
        assertions[assertionId].settlementResolution = settlementResolution;
        assertionResults[assertionId] = settlementResolution;

        emit AssertionSettled(
            assertionId,
            settlementResolution
                ? assertions[assertionId].asserter
                : assertions[assertionId].disputer,
            assertions[assertionId].disputer != address(0),
            settlementResolution,
            msg.sender
        );

        if (assertions[assertionId].callbackRecipient != address(0)) {
            (bool success, ) = assertions[assertionId].callbackRecipient.call(
                abi.encodeWithSignature(
                    "assertionResolvedCallback(bytes32,bool)",
                    assertionId,
                    settlementResolution
                )
            );
            require(success, "Resolution callback failed");
        }
    }

    function getAssertionResult(
        bytes32 assertionId
    ) external view returns (bool) {
        require(assertions[assertionId].settled, "Assertion not settled");
        return assertionResults[assertionId];
    }

    function defaultIdentifier() external pure returns (bytes32) {
        return defaultIdentifierValue;
    }

    function getMinimumBond(address) external pure returns (uint256) {
        return minimumBondValue;
    }
}
