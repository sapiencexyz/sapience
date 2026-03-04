// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/IPredictionMarketToken.sol";

/**
 * @title PredictionMarketToken
 * @notice ERC20 token representing a position in a prediction (predictor or counterparty)
 * @dev Fungible token shared across predictions with same picks.
 *      Supply is dynamic (equals total collateral). Created by PredictionMarketEscrow.
 */
contract PredictionMarketToken is ERC20, IPredictionMarketToken {
    /// @inheritdoc IPredictionMarketToken
    bytes32 public immutable pickConfigId;

    /// @inheritdoc IPredictionMarketToken
    bool public immutable isPredictorToken;

    /// @notice Address authorized to mint/burn tokens (market or bridge contract)
    address public immutable authority;

    error Unauthorized();

    /// @notice Create a new position token
    /// @param name_ Token name
    /// @param symbol_ Token symbol
    /// @param pickConfigId_ The pick configuration this token belongs to
    /// @param isPredictorToken_ True if this is the predictor token
    /// @param authority_ Address authorized to mint/burn tokens
    constructor(
        string memory name_,
        string memory symbol_,
        bytes32 pickConfigId_,
        bool isPredictorToken_,
        address authority_
    ) ERC20(name_, symbol_) {
        pickConfigId = pickConfigId_;
        isPredictorToken = isPredictorToken_;
        authority = authority_;
        // No initial mint - tokens are minted dynamically when bets are placed
    }

    /// @inheritdoc IPredictionMarketToken
    function mint(address to, uint256 amount) external {
        if (msg.sender != authority) {
            revert Unauthorized();
        }
        _mint(to, amount);
    }

    /// @inheritdoc IPredictionMarketToken
    function burn(address holder, uint256 amount) external {
        if (msg.sender != authority) {
            revert Unauthorized();
        }
        _burn(holder, amount);
    }

    /// @notice Override to return 18 decimals (same as most ERC20s)
    function decimals() public pure override returns (uint8) {
        return 18;
    }
}
