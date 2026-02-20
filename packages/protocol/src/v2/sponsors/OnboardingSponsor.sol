// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IMintSponsor.sol";
import "../interfaces/IV2Types.sol";

/**
 * @title OnboardingSponsor
 * @notice Funds a predictor's collateral during mint, gated by per-user budgets
 * @dev Designed for onboarding: user enters invite code → API signer grants budget →
 *      user mints → escrow calls fundMint → sponsor transfers collateral
 *
 *   Roles:
 *     - Owner: sweep funds, set match limit, set/rotate budget manager
 *     - Budget manager: set per-user budgets (intended for an API signer)
 *
 *   Anyone can fund the contract by transferring collateral tokens to it.
 *   Deploy a new instance if the escrow or collateral token changes.
 */
contract OnboardingSponsor is IMintSponsor, Ownable {
    using SafeERC20 for IERC20;

    // ============ Types ============

    struct Budget {
        uint256 allocated;
        uint256 used;
    }

    // ============ Events ============

    event Sponsored(address indexed predictor, uint256 collateral, address indexed escrow);
    event BudgetSet(address indexed beneficiary, uint256 allocated);
    event BudgetManagerSet(address indexed manager);
    event MatchLimitSet(uint256 matchLimit);

    // ============ Errors ============

    error UnauthorizedEscrow();
    error UnauthorizedBudgetManager();
    error NoBudget();
    error BudgetExceeded();
    error CollateralExceedsMatchLimit();
    error NativeTransferFailed();
    error ArrayLengthMismatch();

    // ============ State ============

    /// @notice The escrow contract authorized to call fundMint
    address public immutable escrow;

    /// @notice The collateral token used for sponsorship
    IERC20 public immutable collateralToken;

    /// @notice Maximum collateral the sponsor will fund per mint
    uint256 public matchLimit;

    /// @notice Address authorized to set user budgets (e.g. API signer)
    address public budgetManager;

    /// @notice Per-beneficiary sponsorship budgets
    mapping(address => Budget) public budgets;

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
        IV2Types.Pick[] calldata, /* picks */
        bytes calldata /* sponsorData */
    ) external override {
        if (msg.sender != escrow) revert UnauthorizedEscrow();
        if (collateral > matchLimit) revert CollateralExceedsMatchLimit();

        Budget storage budget = budgets[predictor];
        if (budget.allocated == 0) revert NoBudget();
        if (budget.used + collateral > budget.allocated) revert BudgetExceeded();

        budget.used += collateral;
        collateralToken.safeTransfer(escrow, collateral);

        emit Sponsored(predictor, collateral, escrow);
    }

    // ============ View ============

    /// @notice Remaining sponsorship budget for a beneficiary
    function remainingBudget(address beneficiary) external view returns (uint256) {
        Budget storage b = budgets[beneficiary];
        return b.allocated > b.used ? b.allocated - b.used : 0;
    }

    // ============ Budget Manager ============

    /// @notice Set a single beneficiary's budget
    function setBudget(address beneficiary, uint256 allocated) external {
        _checkBudgetManager();
        budgets[beneficiary].allocated = allocated;
        emit BudgetSet(beneficiary, allocated);
    }

    /// @notice Set budgets for multiple beneficiaries
    function setBudgets(
        address[] calldata beneficiaries,
        uint256[] calldata allocations
    ) external {
        _checkBudgetManager();
        if (beneficiaries.length != allocations.length) revert ArrayLengthMismatch();
        for (uint256 i = 0; i < beneficiaries.length; i++) {
            budgets[beneficiaries[i]].allocated = allocations[i];
            emit BudgetSet(beneficiaries[i], allocations[i]);
        }
    }

    // ============ Owner ============

    /// @notice Set the budget manager (API signer for invite codes)
    function setBudgetManager(address manager) external onlyOwner {
        budgetManager = manager;
        emit BudgetManagerSet(manager);
    }

    /// @notice Set the maximum collateral per mint
    function setMatchLimit(uint256 matchLimit_) external onlyOwner {
        matchLimit = matchLimit_;
        emit MatchLimitSet(matchLimit_);
    }

    /// @notice Sweep ERC20 tokens
    function sweepToken(IERC20 token, address to, uint256 amount) external onlyOwner {
        token.safeTransfer(to, amount);
    }

    /// @notice Sweep native gas tokens
    function sweepNative(address payable to, uint256 amount) external onlyOwner {
        (bool success,) = to.call{value: amount}("");
        if (!success) revert NativeTransferFailed();
    }

    // ============ Funding ============

    /// @notice Accept native gas token deposits
    receive() external payable {}

    // ============ Internal ============

    function _checkBudgetManager() internal view {
        if (msg.sender != budgetManager && msg.sender != owner()) {
            revert UnauthorizedBudgetManager();
        }
    }
}
