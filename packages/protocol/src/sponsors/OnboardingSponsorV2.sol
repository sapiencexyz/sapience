// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title OnboardingSponsorV2
 * @notice Sponsorship pool with reserve/release/spend semantics for the
 *         Committed-Intent flow. V1 (RFQ `fundMint` path) stays alive during
 *         the rollout — V2 is a fresh, independent deploy and exposes no
 *         `fundMint` entrypoint.
 * @dev See prd-001-decisions.md A-5 for the split rationale.
 *
 *   Roles:
 *     - Owner: sweep funds, set budget manager, set trusted caller.
 *     - Budget manager: set per-user allocations (e.g. API signer).
 *     - Trusted caller: the CommittedIntentExecutor — the ONLY address that
 *       may call `reserve`, `release`, or `spend`.
 */
contract OnboardingSponsorV2 is Ownable {
    using SafeERC20 for IERC20;

    // ============ Events ============

    event AllocationSet(address indexed predictor, uint256 allocation);
    event BudgetManagerSet(address indexed manager);
    event TrustedCallerSet(address indexed caller);
    event Reserved(address indexed predictor, uint256 amount);
    event Released(address indexed predictor, uint256 amount);
    event Spent(
        address indexed predictor, address indexed sink, uint256 amount
    );

    // ============ Errors ============

    error UnauthorizedCaller();
    error UnauthorizedBudgetManager();
    error ArrayLengthMismatch();
    error ReserveExceedsAvailable();
    error ReleaseExceedsReserved();
    error SpendExceedsReserved();

    // ============ State ============

    /// @notice WUSDe (or whatever the executor uses for settlement).
    IERC20 public immutable collateralToken;

    /// @notice The one and only address allowed to call the state-mutating
    ///         sponsor entrypoints (the CommittedIntentExecutor).
    address public trustedCaller;

    /// @notice Budget manager (API signer) for allocation updates.
    address public budgetManager;

    /// @notice Per-predictor allocation (ceiling).
    mapping(address => uint256) public totalAllocation;

    /// @notice Amount already spent (transferred out via `spend`).
    mapping(address => uint256) public spent;

    /// @notice Amount currently reserved (held for in-flight commitments).
    mapping(address => uint256) public reserved;

    // ============ Constructor ============

    constructor(address collateralToken_, address owner_) Ownable(owner_) {
        collateralToken = IERC20(collateralToken_);
    }

    // ============ Owner ============

    function setTrustedCaller(address caller) external onlyOwner {
        trustedCaller = caller;
        emit TrustedCallerSet(caller);
    }

    function setBudgetManager(address manager) external onlyOwner {
        budgetManager = manager;
        emit BudgetManagerSet(manager);
    }

    function sweepToken(IERC20 token, address to, uint256 amount)
        external
        onlyOwner
    {
        token.safeTransfer(to, amount);
    }

    // ============ Budget manager ============

    function setAllocation(address predictor, uint256 allocation) external {
        _checkBudgetManager();
        totalAllocation[predictor] = allocation;
        emit AllocationSet(predictor, allocation);
    }

    function setAllocations(
        address[] calldata predictors,
        uint256[] calldata allocations
    ) external {
        _checkBudgetManager();
        if (predictors.length != allocations.length) {
            revert ArrayLengthMismatch();
        }
        for (uint256 i = 0; i < predictors.length; i++) {
            totalAllocation[predictors[i]] = allocations[i];
            emit AllocationSet(predictors[i], allocations[i]);
        }
    }

    // ============ Trusted caller (executor) ============

    /// @notice Reserve `amount` against `predictor`'s allocation. Does NOT
    ///         transfer tokens; marks capacity as in-flight.
    function reserve(
        address predictor,
        uint256 amount,
        bytes calldata /*data*/
    )
        external
    {
        _checkTrustedCaller();
        if (amount > availableFor(predictor)) revert ReserveExceedsAvailable();
        reserved[predictor] += amount;
        emit Reserved(predictor, amount);
    }

    /// @notice Release `amount` from `reserved[predictor]` back to capacity.
    function release(address predictor, uint256 amount) external {
        _checkTrustedCaller();
        if (amount > reserved[predictor]) revert ReleaseExceedsReserved();
        reserved[predictor] -= amount;
        emit Released(predictor, amount);
    }

    /// @notice Consume `amount` from the predictor's reservation and transfer
    ///         it to the executor (which will forward it to the collateral
    ///         sink inside settle). The reservation must cover the spend.
    function spend(address predictor, uint256 amount) external {
        _checkTrustedCaller();
        if (amount > reserved[predictor]) revert SpendExceedsReserved();
        reserved[predictor] -= amount;
        spent[predictor] += amount;
        collateralToken.safeTransfer(msg.sender, amount);
        emit Spent(predictor, msg.sender, amount);
    }

    // ============ Views ============

    /// @notice Remaining headroom = allocation - spent - reserved.
    function availableFor(address predictor) public view returns (uint256) {
        uint256 alloc = totalAllocation[predictor];
        uint256 consumed = spent[predictor] + reserved[predictor];
        return alloc > consumed ? alloc - consumed : 0;
    }

    // ============ Internal ============

    function _checkTrustedCaller() internal view {
        if (msg.sender != trustedCaller) revert UnauthorizedCaller();
    }

    function _checkBudgetManager() internal view {
        if (msg.sender != budgetManager && msg.sender != owner()) {
            revert UnauthorizedBudgetManager();
        }
    }
}
