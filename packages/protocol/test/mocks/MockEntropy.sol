// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../src/bingo/IEntropy.sol";

/// @notice Test double for Pyth Entropy that lets tests push callbacks
///         on demand. Records the consumer that made each request so the
///         driver can replay callbacks without re-implementing Pyth's
///         provider state.
contract MockEntropy is IEntropy {
    uint64 public nextSequence = 1;
    uint128 public feeAmount;
    mapping(uint64 => address) public consumerOf;
    mapping(uint64 => bytes32) public userRandomOf;
    bool public revertOnRequest;

    function setFee(uint128 fee) external {
        feeAmount = fee;
    }

    function setRevertOnRequest(bool shouldRevert) external {
        revertOnRequest = shouldRevert;
    }

    function getFeeV2(
        address /* provider */
    )
        external
        view
        override
        returns (uint128)
    {
        return feeAmount;
    }

    function requestWithCallback(
        address, /* provider */
        bytes32 userRandomNumber
    )
        external
        payable
        override
        returns (uint64 sequenceNumber)
    {
        require(!revertOnRequest, "MockEntropy: requested-revert");
        require(msg.value >= feeAmount, "MockEntropy: fee underpaid");
        sequenceNumber = nextSequence++;
        consumerOf[sequenceNumber] = msg.sender;
        userRandomOf[sequenceNumber] = userRandomNumber;
    }

    /// @notice Drive the callback into a consumer with an arbitrary random value
    function pushCallback(
        uint64 sequenceNumber,
        address provider,
        bytes32 randomNumber
    ) external {
        address consumer = consumerOf[sequenceNumber];
        require(consumer != address(0), "MockEntropy: unknown sequence");
        IEntropyConsumer(consumer)
            .entropyCallback(sequenceNumber, provider, randomNumber);
    }
}
