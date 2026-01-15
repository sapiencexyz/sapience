// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IPositionToken.sol";

/**
 * @title PositionToken
 * @notice ERC20 token representing a position in a prediction (predictor or counterparty)
 * @dev Fixed supply of 1e18, burnable for redemption. Created by PredictionMarketV2.
 */
contract PositionToken is ERC20, IPositionToken {
    /// @inheritdoc IPositionToken
    uint256 public constant TOTAL_SUPPLY = 1e18;

    /// @inheritdoc IPositionToken
    bytes32 public immutable predictionId;

    /// @inheritdoc IPositionToken
    address public immutable factory;

    /// @inheritdoc IPositionToken
    bool public immutable isPredictorToken;

    /// @notice Address authorized to burn tokens (market contract)
    address public immutable market;

    error Unauthorized();

    /// @notice Create a new position token
    /// @param name_ Token name
    /// @param symbol_ Token symbol
    /// @param predictionId_ The prediction this token belongs to
    /// @param isPredictorToken_ True if this is the predictor token
    /// @param recipient Initial recipient of the token supply
    /// @param market_ Address authorized to burn tokens (the market contract)
    constructor(
        string memory name_,
        string memory symbol_,
        bytes32 predictionId_,
        bool isPredictorToken_,
        address recipient,
        address market_
    ) ERC20(name_, symbol_) {
        predictionId = predictionId_;
        factory = msg.sender; // The market is also the factory now
        isPredictorToken = isPredictorToken_;
        market = market_;
        _mint(recipient, TOTAL_SUPPLY);
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
