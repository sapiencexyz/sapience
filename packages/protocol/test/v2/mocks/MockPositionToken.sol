// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockPositionToken
/// @notice Mock position token for bridge testing
contract MockPositionToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1e18;

    bytes32 public immutable predictionId;
    bool public immutable isPredictorToken;

    constructor(
        string memory name_,
        string memory symbol_,
        bytes32 predictionId_,
        bool isPredictorToken_,
        address recipient
    ) ERC20(name_, symbol_) {
        predictionId = predictionId_;
        isPredictorToken = isPredictorToken_;
        _mint(recipient, TOTAL_SUPPLY);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
