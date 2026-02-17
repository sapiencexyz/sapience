// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IPredictionMarketTokenBridged.sol";

/// @title PredictionMarketTokenBridged
/// @notice ERC20 token representing a bridged position (on remote chain)
/// @dev Mintable/burnable only by the bridge contract
contract PredictionMarketTokenBridged is
    ERC20,
    IPredictionMarketTokenBridged
{
    /// @inheritdoc IPredictionMarketTokenBridged
    bytes32 public immutable pickConfigId;

    /// @inheritdoc IPredictionMarketTokenBridged
    bool public immutable isPredictorToken;

    /// @inheritdoc IPredictionMarketTokenBridged
    address public immutable bridge;

    /// @notice Create a new bridged position token
    /// @param name_ Token name
    /// @param symbol_ Token symbol
    /// @param pickConfigId_ The prediction this token represents
    /// @param isPredictorToken_ True if this is the predictor token
    /// @param bridge_ Address authorized to mint/burn (the bridge contract)
    constructor(
        string memory name_,
        string memory symbol_,
        bytes32 pickConfigId_,
        bool isPredictorToken_,
        address bridge_
    ) ERC20(name_, symbol_) {
        pickConfigId = pickConfigId_;
        isPredictorToken = isPredictorToken_;
        bridge = bridge_;
    }

    /// @inheritdoc IPredictionMarketTokenBridged
    function mint(address to, uint256 amount) external {
        if (msg.sender != bridge) revert OnlyBridge();
        _mint(to, amount);
    }

    /// @inheritdoc IPredictionMarketTokenBridged
    function burn(address from, uint256 amount) external {
        if (msg.sender != bridge) revert OnlyBridge();
        _burn(from, amount);
    }

    /// @notice Override to return 18 decimals (same as source token)
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
