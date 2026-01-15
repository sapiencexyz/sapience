// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IBridgedPositionToken.sol";

/// @title BridgedPositionToken
/// @notice ERC20 token representing a bridged position (on remote chain)
/// @dev Mintable/burnable only by the bridge contract
contract BridgedPositionToken is ERC20, IBridgedPositionToken {
    /// @inheritdoc IBridgedPositionToken
    bytes32 public immutable predictionId;

    /// @inheritdoc IBridgedPositionToken
    bool public immutable isPredictorToken;

    /// @inheritdoc IBridgedPositionToken
    address public immutable bridge;

    /// @inheritdoc IBridgedPositionToken
    address public immutable factory;

    /// @notice Create a new bridged position token
    /// @param name_ Token name
    /// @param symbol_ Token symbol
    /// @param predictionId_ The prediction this token represents
    /// @param isPredictorToken_ True if this is the predictor token
    /// @param bridge_ Address authorized to mint/burn (the bridge contract)
    constructor(
        string memory name_,
        string memory symbol_,
        bytes32 predictionId_,
        bool isPredictorToken_,
        address bridge_
    ) ERC20(name_, symbol_) {
        predictionId = predictionId_;
        isPredictorToken = isPredictorToken_;
        bridge = bridge_;
        factory = msg.sender; // Factory deploys via CREATE3
    }

    /// @inheritdoc IBridgedPositionToken
    function mint(address to, uint256 amount) external {
        if (msg.sender != bridge) revert OnlyBridge();
        _mint(to, amount);
    }

    /// @inheritdoc IBridgedPositionToken
    function burn(address from, uint256 amount) external {
        if (msg.sender != bridge) revert OnlyBridge();
        _burn(from, amount);
    }

    /// @notice Override to return 18 decimals (same as source token)
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
