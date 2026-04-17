// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IInsurancePool } from "./interfaces/IInsurancePool.sol";

/**
 * @title InsurancePool
 * @notice Permissionless pool of WUSDe, funded by counterparty slash excess
 *         and drawn on by the executor when a vault doesn't fully cover a
 *         make-whole delta. Single-asset, no admin, no non-executor withdrawals.
 */
contract InsurancePool is IInsurancePool, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Events ============

    event Contributed(
        bytes32 indexed commitmentHash, address indexed fromCp, uint256 amount
    );
    event Drawn(
        bytes32 indexed commitmentHash, address indexed sink, uint256 amount
    );

    // ============ Errors ============

    error UnauthorizedExecutor();

    // ============ State ============

    IERC20 public immutable collateralToken;
    address public immutable executor;

    uint256 private _balance;

    // ============ Constructor ============

    constructor(address collateralToken_, address executor_) {
        collateralToken = IERC20(collateralToken_);
        executor = executor_;
    }

    // ============ Public ============

    /// @inheritdoc IInsurancePool
    function contribute(bytes32 commitmentHash, address fromCp, uint256 amount)
        external
        nonReentrant
    {
        if (amount == 0) return;
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        _balance += amount;
        emit Contributed(commitmentHash, fromCp, amount);
    }

    /// @inheritdoc IInsurancePool
    function drawFor(bytes32 commitmentHash, address sink, uint256 requested)
        external
        nonReentrant
        returns (uint256 drawn)
    {
        if (msg.sender != executor) revert UnauthorizedExecutor();
        if (requested == 0) return 0;
        drawn = requested > _balance ? _balance : requested;
        if (drawn > 0) {
            _balance -= drawn;
            collateralToken.safeTransfer(sink, drawn);
            emit Drawn(commitmentHash, sink, drawn);
        }
    }

    /// @inheritdoc IInsurancePool
    function balance() external view returns (uint256) {
        return _balance;
    }
}
