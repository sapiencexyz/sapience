// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ICounterpartyVault } from "./interfaces/ICounterpartyVault.sol";

/**
 * @title CounterpartyVault
 * @notice WUSDe collateral pool shared across a counterparty's live quotes.
 * @dev v1 single-asset (WUSDe hardcoded in constructor). See PRD §4.4.
 */
contract CounterpartyVault is ICounterpartyVault, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Events ============

    event Deposited(address indexed cp, uint256 amount);
    event Withdrawn(address indexed cp, uint256 amount);
    event EarliestWithdrawalBumped(address indexed cp, uint64 when);
    event SlashTotal(
        address indexed cp, address indexed sink, uint256 vaultDrained
    );
    event PullOutExecuted(
        address indexed cp,
        address indexed sink,
        uint256 requested,
        uint256 fromWallet,
        uint256 fromVault
    );

    // ============ Errors ============

    error UnauthorizedExecutor();
    error InsufficientBalance();
    error WithdrawalLocked(uint64 earliestWithdrawal);

    // ============ State ============

    IERC20 public immutable collateralToken;
    address public immutable executor;

    mapping(address => uint256) private _balance;
    mapping(address => uint64) private _earliestWithdrawal;

    // ============ Constructor ============

    constructor(address collateralToken_, address executor_) {
        collateralToken = IERC20(collateralToken_);
        executor = executor_;
    }

    // ============ Counterparty entrypoints ============

    /// @inheritdoc ICounterpartyVault
    function deposit(uint256 amount) external nonReentrant {
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        _balance[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /// @inheritdoc ICounterpartyVault
    function withdraw(uint256 amount) external nonReentrant {
        uint64 lockUntil = _earliestWithdrawal[msg.sender];
        if (block.timestamp < lockUntil) revert WithdrawalLocked(lockUntil);
        uint256 bal = _balance[msg.sender];
        if (amount > bal) revert InsufficientBalance();
        _balance[msg.sender] = bal - amount;
        collateralToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /// @inheritdoc ICounterpartyVault
    function bumpEarliestWithdrawal(uint64 when) external {
        if (when > _earliestWithdrawal[msg.sender]) {
            _earliestWithdrawal[msg.sender] = when;
            emit EarliestWithdrawalBumped(msg.sender, when);
        }
    }

    // ============ Views ============

    /// @inheritdoc ICounterpartyVault
    function balanceOf(address cp) external view returns (uint256) {
        return _balance[cp];
    }

    /// @inheritdoc ICounterpartyVault
    function earliestWithdrawal(address cp) external view returns (uint64) {
        return _earliestWithdrawal[cp];
    }

    // ============ Executor-only ============

    /// @inheritdoc ICounterpartyVault
    function slashTotal(address cp, address sink)
        external
        nonReentrant
        returns (uint256 vaultDrained)
    {
        if (msg.sender != executor) revert UnauthorizedExecutor();
        vaultDrained = _balance[cp];
        if (vaultDrained > 0) {
            _balance[cp] = 0;
            collateralToken.safeTransfer(sink, vaultDrained);
        }
        emit SlashTotal(cp, sink, vaultDrained);
    }

    /// @inheritdoc ICounterpartyVault
    /// @dev Atomic: only transfers when wallet + vault together cover the
    ///      full `amount`. A pure wallet fill leaves the vault untouched;
    ///      a mixed fill pulls `amount - walletFill` from the vault. Any
    ///      shortfall leaves BOTH wallet and vault unchanged so the caller
    ///      can slash the full remaining vault balance cleanly.
    function pullOut(address cp, uint256 amount, address sink)
        external
        nonReentrant
        returns (uint256 pulled)
    {
        if (msg.sender != executor) revert UnauthorizedExecutor();
        if (amount == 0) return 0;

        // Wallet probe: check allowance and balance without side-effects.
        uint256 walletAvailable = 0;
        uint256 cpAllowance = collateralToken.allowance(cp, address(this));
        uint256 cpBalance = collateralToken.balanceOf(cp);
        uint256 cpEffective = cpAllowance < cpBalance ? cpAllowance : cpBalance;
        walletAvailable = cpEffective > amount ? amount : cpEffective;

        uint256 vaultBal = _balance[cp];
        uint256 combined = walletAvailable + vaultBal;
        if (combined < amount) {
            // Cannot cover — leave everything intact, caller will slashTotal.
            emit PullOutExecuted(cp, sink, amount, 0, 0);
            return 0;
        }

        // Prefer wallet, top up from vault.
        uint256 fromWallet = walletAvailable;
        uint256 fromVault = amount - fromWallet;

        if (fromWallet > 0) {
            collateralToken.safeTransferFrom(cp, sink, fromWallet);
        }
        if (fromVault > 0) {
            _balance[cp] = vaultBal - fromVault;
            collateralToken.safeTransfer(sink, fromVault);
        }

        pulled = fromWallet + fromVault;
        emit PullOutExecuted(cp, sink, amount, fromWallet, fromVault);
    }
}
