// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IPositionToken.sol";

/**
 * @title PositionToken
 * @notice ERC20 token representing a position in a prediction (predictor or counterparty)
 * @dev Fungible token shared across predictions with same picks.
 *      Supply is dynamic (equals total wagers). Created by PredictionMarketV2.
 */
contract PositionToken is ERC20, IPositionToken {
    /// @inheritdoc IPositionToken
    bytes32 public immutable pickConfigId;

    /// @inheritdoc IPositionToken
    bool public immutable isPredictorToken;

    /// @notice Address authorized to mint/burn tokens (market contract)
    address public immutable market;

    error Unauthorized();

    /// @notice Create a new position token
    /// @param name_ Token name
    /// @param symbol_ Token symbol
    /// @param pickConfigId_ The pick configuration this token belongs to
    /// @param isPredictorToken_ True if this is the predictor token
    /// @param market_ Address authorized to mint/burn tokens (the market contract)
    constructor(
        string memory name_,
        string memory symbol_,
        bytes32 pickConfigId_,
        bool isPredictorToken_,
        address market_
    ) ERC20(name_, symbol_) {
        pickConfigId = pickConfigId_;
        isPredictorToken = isPredictorToken_;
        market = market_;
        // No initial mint - tokens are minted dynamically when bets are placed
    }

    /// @inheritdoc IPositionToken
    function mint(address to, uint256 amount) external {
        if (msg.sender != market) {
            revert Unauthorized();
        }
        _mint(to, amount);
    }

    /// @inheritdoc IPositionToken
    function burn(address holder, uint256 amount) external {
        if (msg.sender != market) {
            revert Unauthorized();
        }
        _burn(holder, amount);
    }

    /// @notice Override to return 18 decimals (same as most ERC20s)
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
