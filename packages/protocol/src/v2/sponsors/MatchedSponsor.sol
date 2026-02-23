// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IMintSponsor.sol";
import "../interfaces/IV2Types.sol";

/**
 * @title MatchedSponsor
 * @notice Example sponsor that funds predictor collateral with configurable controls
 * @dev Features:
 *   - Owner-managed per-beneficiary budgets (allocated vs used tracking)
 *   - Configurable match limit (max collateral per mint)
 *   - Required condition enforcement (resolver + conditionId must be in picks)
 *   - Owner can withdraw ERC20s and native gas tokens
 *   - Only the registered escrow can call fundMint
 */
contract MatchedSponsor is IMintSponsor, Ownable {
    using SafeERC20 for IERC20;

    // ============ Types ============

    struct Budget {
        uint256 allocated; // Total collateral allocated to this beneficiary
        uint256 used; // Total collateral already sponsored
    }

    // ============ Events ============

    event Sponsored(
        address indexed predictor, uint256 collateral, address indexed escrow
    );
    event BudgetSet(address indexed beneficiary, uint256 allocated);

    // ============ Errors ============

    error UnauthorizedEscrow();
    error NoBudget();
    error BudgetExceeded();
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
        IV2Types.MintRequest calldata request
    ) external override {
        if (msg.sender != escrow) revert UnauthorizedEscrow();
        if (request.predictorCollateral > matchLimit) {
            revert CollateralExceedsMatchLimit();
        }

        Budget storage budget = budgets[request.predictor];
        if (budget.allocated == 0) revert NoBudget();
        if (budget.used + request.predictorCollateral > budget.allocated) {
            revert BudgetExceeded();
        }

        // Enforce required condition if set
        if (requiredResolver != address(0)) {
            bool found = false;
            for (uint256 i = 0; i < request.picks.length; i++) {
                if (
                    request.picks[i].conditionResolver == requiredResolver
                        && request.picks[i].conditionId == requiredConditionId
                ) {
                    found = true;
                    break;
                }
            }
            if (!found) revert RequiredConditionNotFound();
        }

        // Update budget
        budget.used += request.predictorCollateral;

        // Transfer collateral to the escrow
        collateralToken.safeTransfer(escrow_, request.predictorCollateral);

        emit Sponsored(request.predictor, request.predictorCollateral, escrow_);
    }

    // ============ View Functions ============

    /// @notice Get remaining budget for a beneficiary
    function remainingBudget(address beneficiary)
        external
        view
        returns (uint256)
    {
        Budget storage budget = budgets[beneficiary];
        if (budget.allocated <= budget.used) return 0;
        return budget.allocated - budget.used;
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

    /// @notice Set a beneficiary's total budget allocation
    function setBudget(address beneficiary, uint256 allocated)
        external
        onlyOwner
    {
        budgets[beneficiary].allocated = allocated;
        emit BudgetSet(beneficiary, allocated);
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
