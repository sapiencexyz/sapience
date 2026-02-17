// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IMintSponsor.sol";
import "../interfaces/IV2Types.sol";

/**
 * @title MatchedBetSponsor
 * @notice Example sponsor that funds predictor collateral with configurable controls
 * @dev Features:
 *   - Owner-managed whitelist of beneficiary addresses
 *   - Configurable match limit (max collateral per mint)
 *   - Required condition enforcement (resolver + conditionId must be in picks)
 *   - Owner can withdraw ERC20s and native gas tokens
 *   - Only the registered escrow can call fundMint
 */
contract MatchedBetSponsor is IMintSponsor, Ownable {
    using SafeERC20 for IERC20;

    // ============ Events ============

    event Sponsored(
        address indexed predictor, uint256 collateral, address indexed escrow
    );

    // ============ Errors ============

    error UnauthorizedEscrow();
    error NotWhitelisted();
    error CollateralExceedsMatchLimit();
    error RequiredConditionNotFound();

    // ============ State ============

    /// @notice The escrow contract authorized to call fundMint
    address public immutable escrow;

    /// @notice The collateral token used for sponsorship
    IERC20 public immutable collateralToken;

    /// @notice Maximum collateral the sponsor will fund per mint
    uint256 public matchLimit;

    /// @notice Required condition resolver (address(0) = no requirement)
    address public requiredResolver;

    /// @notice Required condition ID (bytes32(0) = no requirement)
    bytes32 public requiredConditionId;

    /// @notice Whitelisted beneficiary addresses
    mapping(address => bool) public whitelisted;

    // ============ Constructor ============

    constructor(
        address escrow_,
        address collateralToken_,
        uint256 matchLimit_,
        address owner_
    ) Ownable(owner_) {
        escrow = escrow_;
        collateralToken = IERC20(collateralToken_);
        matchLimit = matchLimit_;
    }

    // ============ IMintSponsor ============

    /// @inheritdoc IMintSponsor
    function fundMint(
        address escrow_,
        address predictor,
        uint256 collateral,
        IV2Types.Pick[] calldata picks,
        bytes calldata /* sponsorData */
    ) external override {
        if (msg.sender != escrow) revert UnauthorizedEscrow();
        if (!whitelisted[predictor]) revert NotWhitelisted();
        if (collateral > matchLimit) revert CollateralExceedsMatchLimit();

        // Enforce required condition if set
        if (requiredResolver != address(0)) {
            bool found = false;
            for (uint256 i = 0; i < picks.length; i++) {
                if (
                    picks[i].conditionResolver == requiredResolver
                        && picks[i].conditionId == requiredConditionId
                ) {
                    found = true;
                    break;
                }
            }
            if (!found) revert RequiredConditionNotFound();
        }

        // Transfer collateral to the escrow
        collateralToken.safeTransfer(escrow_, collateral);

        emit Sponsored(predictor, collateral, escrow_);
    }

    // ============ Admin Functions ============

    /// @notice Set the match limit
    function setMatchLimit(uint256 matchLimit_) external onlyOwner {
        matchLimit = matchLimit_;
    }

    /// @notice Set the required condition
    function setRequiredCondition(address resolver, bytes32 conditionId)
        external
        onlyOwner
    {
        requiredResolver = resolver;
        requiredConditionId = conditionId;
    }

    /// @notice Add or remove an address from the whitelist
    function setWhitelisted(address beneficiary, bool status)
        external
        onlyOwner
    {
        whitelisted[beneficiary] = status;
    }

    /// @notice Withdraw ERC20 tokens
    function withdrawERC20(IERC20 token, address to, uint256 amount)
        external
        onlyOwner
    {
        token.safeTransfer(to, amount);
    }

    /// @notice Withdraw native gas tokens
    function withdrawNative(address payable to, uint256 amount)
        external
        onlyOwner
    {
        (bool success,) = to.call{ value: amount }("");
        require(success, "Native transfer failed");
    }

    /// @notice Accept native gas token deposits
    receive() external payable { }
}
