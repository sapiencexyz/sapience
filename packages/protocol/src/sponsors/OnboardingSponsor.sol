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
 *   Constraints enforced on-chain:
 *     - Required counterparty (e.g. vault-bot) — prevents self-dealing
 *     - Max entry price cap — prevents risk-free farming on near-certain outcomes
 *       Entry price = predictorCollateral / (predictorCollateral + counterpartyCollateral)
 *
 *   Roles:
 *     - Owner: sweep funds, set match limit, set/rotate budget manager
 *     - Budget manager: set per-user budgets (intended for an API signer)
 *
 *   Anyone can fund the contract by transferring collateral tokens to it.
 *   Deploy a new instance if the escrow, collateral token, counterparty, or price cap changes.
 */
contract OnboardingSponsor is IMintSponsor, Ownable {
    using SafeERC20 for IERC20;

    // ============ Types ============

    struct Budget {
        uint256 allocated;
        uint256 used;
    }

    // ============ Events ============

    event Sponsored(
        address indexed predictor, uint256 collateral, address indexed escrow
    );
    event BudgetSet(address indexed beneficiary, uint256 allocated);
    event BudgetManagerSet(address indexed manager);
    event MatchLimitSet(uint256 matchLimit);

    // ============ Errors ============

    error UnauthorizedEscrow();
    error UnauthorizedBudgetManager();
    error UnauthorizedCounterparty();
    error EntryPriceTooHigh();
    error NoBudget();
    error BudgetExceeded();
    error CollateralExceedsMatchLimit();
    error NativeTransferFailed();
    error ArrayLengthMismatch();

    // ============ Constants ============

    /// @notice Basis points denominator (100% = 10000)
    uint256 public constant BPS = 10_000;

    // ============ State ============

    /// @notice The escrow contract authorized to call fundMint
    address public immutable escrow;

    /// @notice The collateral token used for sponsorship
    IERC20 public immutable collateralToken;

    /// @notice Required counterparty for sponsored mints (e.g. vault-bot)
    address public immutable requiredCounterparty;

    /// @notice Maximum entry price in basis points (e.g. 7000 = 0.70)
    uint256 public immutable maxEntryPriceBps;

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
        address requiredCounterparty_,
        uint256 maxEntryPriceBps_,
        uint256 matchLimit_,
        address owner_
    ) Ownable(owner_) {
        escrow = escrow_;
        collateralToken = IERC20(collateralToken_);
        requiredCounterparty = requiredCounterparty_;
        maxEntryPriceBps = maxEntryPriceBps_;
        matchLimit = matchLimit_;
    }

    // ============ IMintSponsor ============

    /// @inheritdoc IMintSponsor
    function fundMint(
        address, /* escrow_ */
        IV2Types.MintRequest calldata request
    )
        external
        override
    {
        if (msg.sender != escrow) revert UnauthorizedEscrow();

        // Enforce required counterparty (prevents self-dealing)
        if (request.counterparty != requiredCounterparty) {
            revert UnauthorizedCounterparty();
        }

        // Enforce entry price cap (prevents risk-free farming)
        // entryPrice = predictorCollateral / totalCollateral
        uint256 totalCollateral =
            request.predictorCollateral + request.counterpartyCollateral;
        uint256 entryPriceBps =
            (request.predictorCollateral * BPS) / totalCollateral;
        if (entryPriceBps > maxEntryPriceBps) revert EntryPriceTooHigh();

        if (request.predictorCollateral > matchLimit) {
            revert CollateralExceedsMatchLimit();
        }

        Budget storage budget = budgets[request.predictor];
        if (budget.allocated == 0) revert NoBudget();
        if (budget.used + request.predictorCollateral > budget.allocated) {
            revert BudgetExceeded();
        }

        budget.used += request.predictorCollateral;
        collateralToken.safeTransfer(escrow, request.predictorCollateral);

        emit Sponsored(request.predictor, request.predictorCollateral, escrow);
    }

    // ============ View ============

    /// @notice Remaining sponsorship budget for a beneficiary
    function remainingBudget(address beneficiary)
        external
        view
        returns (uint256)
    {
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
        if (beneficiaries.length != allocations.length) {
            revert ArrayLengthMismatch();
        }
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
    function sweepToken(IERC20 token, address to, uint256 amount)
        external
        onlyOwner
    {
        token.safeTransfer(to, amount);
    }

    /// @notice Sweep native gas tokens
    function sweepNative(address payable to, uint256 amount)
        external
        onlyOwner
    {
        (bool success,) = to.call{ value: amount }("");
        if (!success) revert NativeTransferFailed();
    }

    // ============ Funding ============

    /// @notice Accept native gas token deposits
    receive() external payable { }

    // ============ Internal ============

    function _checkBudgetManager() internal view {
        if (msg.sender != budgetManager && msg.sender != owner()) {
            revert UnauthorizedBudgetManager();
        }
    }
}
