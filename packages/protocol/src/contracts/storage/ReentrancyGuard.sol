// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

contract ReentrancyGuard {
    error ReentrancyNotAllowed();

    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    struct ReentrancyData {
        uint256 status;
    }

    function loadReentrancy()
        internal
        pure
        returns (ReentrancyData storage store)
    {
        bytes32 s = keccak256(abi.encode("foil.gas.Reentrancy"));
        assembly {
            store.slot := s
        }
    }

    modifier nonReentrant() {
        ReentrancyData storage self = loadReentrancy();
        require(self.status != ENTERED, "Reentrancy: reentrant call");
        self.status = ENTERED;
        _;
        self.status = NOT_ENTERED;
    }

    function initializeReentrancy() internal {
        ReentrancyData storage self = loadReentrancy();
        self.status = NOT_ENTERED;
    }
}
