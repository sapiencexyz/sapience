// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// Minimal Pyth Entropy interface, inlined here to avoid a runtime dependency
// on the @pythnetwork/entropy-sdk-solidity package. See
// https://docs.pyth.network/entropy/contract-addresses for deployed providers.

interface IEntropy {
    function requestWithCallback(address provider, bytes32 userRandomNumber)
        external
        payable
        returns (uint64 assignedSequenceNumber);

    function getFeeV2(address provider) external view returns (uint128 fee);
}

/// @notice Abstract consumer that receives Entropy callbacks
abstract contract IEntropyConsumer {
    /// @dev Called by the Entropy contract; forwards to `_entropyCallback`.
    function entropyCallback(
        uint64 sequenceNumber,
        address provider,
        bytes32 randomNumber
    ) external {
        if (msg.sender != getEntropy()) {
            revert NotEntropyContract();
        }
        _entropyCallback(sequenceNumber, provider, randomNumber);
    }

    function getEntropy() public view virtual returns (address);

    function _entropyCallback(
        uint64 sequenceNumber,
        address provider,
        bytes32 randomNumber
    ) internal virtual;

    error NotEntropyContract();
}
