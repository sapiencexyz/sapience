// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IEntropy.sol";

/**
 * @title StaticEntropy
 * @notice Stand-in for Pyth Entropy where the random output is a fixed value
 *         the deployer can update at any time. Useful for staging and local
 *         demos where Pyth's async provider isn't available.
 *
 *         Flow:
 *           1. BingoCard.mintCard() calls requestWithCallback() — records
 *              the consumer + sequence and returns the sequence.
 *           2. The admin calls pushCallback(seq) (or pushAll()) which drives
 *              IEntropyConsumer.entropyCallback() back into BingoCard with
 *              the currently configured `fixedRandom`.
 *
 *         The push is required because BingoCard sets pendingReveal[seq]
 *         AFTER requestWithCallback returns — so the callback can't fire
 *         in the same tx as the request.
 */
contract StaticEntropy is IEntropy {
    address public owner;
    uint64 public nextSequence = 1;
    uint128 public feeAmount;

    /// @notice The random value that pushCallback uses. Initially zero;
    ///         deployer should setRandom() before the first push.
    bytes32 public fixedRandom;

    struct Pending {
        address consumer;
        bool fired;
    }

    mapping(uint64 => Pending) public pending;

    event OwnerSet(address indexed owner);
    event FeeSet(uint128 fee);
    event RandomSet(bytes32 random);
    event Pushed(uint64 indexed seq, bytes32 random);

    error NotOwner();
    error FeeUnderpaid();
    error UnknownSequence();
    error AlreadyFired();

    constructor(address owner_) {
        owner = owner_;
        emit OwnerSet(owner_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
        emit OwnerSet(newOwner);
    }

    function setFee(uint128 fee) external onlyOwner {
        feeAmount = fee;
        emit FeeSet(fee);
    }

    function setRandom(bytes32 r) external onlyOwner {
        fixedRandom = r;
        emit RandomSet(r);
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
        bytes32 /* userRandomNumber */
    )
        external
        payable
        override
        returns (uint64 seq)
    {
        if (msg.value < feeAmount) revert FeeUnderpaid();
        seq = nextSequence++;
        pending[seq] = Pending({ consumer: msg.sender, fired: false });
    }

    /// @notice Fire a single pending callback using the stored random.
    function pushCallback(uint64 seq) external {
        Pending storage p = pending[seq];
        if (p.consumer == address(0)) revert UnknownSequence();
        if (p.fired) revert AlreadyFired();
        p.fired = true;
        IEntropyConsumer(p.consumer).entropyCallback(seq, owner, fixedRandom);
        emit Pushed(seq, fixedRandom);
    }

    /// @notice Fire every unfired pending callback in [from, nextSequence).
    function pushAll(uint64 from) external {
        for (uint64 s = from; s < nextSequence; s++) {
            Pending storage p = pending[s];
            if (p.consumer == address(0) || p.fired) continue;
            p.fired = true;
            IEntropyConsumer(p.consumer).entropyCallback(s, owner, fixedRandom);
            emit Pushed(s, fixedRandom);
        }
    }
}
