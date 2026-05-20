// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title BingoPool
/// @notice Admin-managed registry of conditions the bingo product respects,
///         plus a bonus-fund balance the admin can top up and withdraw from.
///         This contract is just bookkeeping for now; how the random number
///         from BingoCard maps onto these conditions, and how the bonus is
///         paid out, is decided off-contract.
contract BingoPool is Ownable {
    using SafeERC20 for IERC20;

    struct Condition {
        address resolver;
        bytes conditionId;
    }

    IERC20 public immutable bonusToken;

    Condition[] private _conditions;
    /// @dev 1-based index into `_conditions`. Zero means "not present".
    mapping(bytes32 => uint256) private _conditionIndex;

    event ConditionAdded(
        bytes32 indexed key, address resolver, bytes conditionId
    );
    event ConditionRemoved(bytes32 indexed key);
    event BonusDeposited(address indexed from, uint256 amount);
    event BonusWithdrawn(address indexed to, uint256 amount);

    error ConditionAlreadyExists();
    error ConditionNotFound();
    error IndexOutOfBounds();

    constructor(address bonusToken_, address owner_) Ownable(owner_) {
        bonusToken = IERC20(bonusToken_);
    }

    // ============ Conditions ============

    function addCondition(address resolver, bytes calldata conditionId)
        external
        onlyOwner
    {
        bytes32 key = conditionKey(resolver, conditionId);
        if (_conditionIndex[key] != 0) revert ConditionAlreadyExists();

        _conditions.push(
            Condition({ resolver: resolver, conditionId: conditionId })
        );
        _conditionIndex[key] = _conditions.length;

        emit ConditionAdded(key, resolver, conditionId);
    }

    function removeCondition(address resolver, bytes calldata conditionId)
        external
        onlyOwner
    {
        bytes32 key = conditionKey(resolver, conditionId);
        uint256 idx1 = _conditionIndex[key];
        if (idx1 == 0) revert ConditionNotFound();

        uint256 lastIdx = _conditions.length - 1;
        uint256 idx = idx1 - 1;

        if (idx != lastIdx) {
            Condition memory moved = _conditions[lastIdx];
            _conditions[idx] = moved;
            _conditionIndex[conditionKey(moved.resolver, moved.conditionId)] =
                idx + 1;
        }

        _conditions.pop();
        delete _conditionIndex[key];

        emit ConditionRemoved(key);
    }

    function conditionCount() external view returns (uint256) {
        return _conditions.length;
    }

    function conditionAt(uint256 index)
        external
        view
        returns (address resolver, bytes memory conditionId)
    {
        if (index >= _conditions.length) revert IndexOutOfBounds();
        Condition storage c = _conditions[index];
        return (c.resolver, c.conditionId);
    }

    function hasCondition(address resolver, bytes calldata conditionId)
        external
        view
        returns (bool)
    {
        return _conditionIndex[conditionKey(resolver, conditionId)] != 0;
    }

    function conditionKey(address resolver, bytes memory conditionId)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(resolver, conditionId));
    }

    // ============ Bonus reserve ============

    function depositBonus(uint256 amount) external {
        bonusToken.safeTransferFrom(msg.sender, address(this), amount);
        emit BonusDeposited(msg.sender, amount);
    }

    function withdrawBonus(uint256 amount, address to) external onlyOwner {
        bonusToken.safeTransfer(to, amount);
        emit BonusWithdrawn(to, amount);
    }

    function bonusBalance() external view returns (uint256) {
        return bonusToken.balanceOf(address(this));
    }
}
