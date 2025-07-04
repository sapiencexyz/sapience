// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {IUMALayerZeroBridge} from "../../../src/bridge/interfaces/ILayerZeroBridge.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ReentrantAttacker
 * @notice Mock contract that attempts reentrancy attacks for testing purposes
 * @dev This contract simulates various reentrancy attack vectors
 */
contract ReentrantAttacker {
    using SafeERC20 for IERC20;

    IUMALayerZeroBridge public bridge;
    IERC20 public bondToken;

    bool public attackInProgress = false;
    uint256 public attackCount = 0;

    constructor() {}

    /**
     * @notice Set the target bridge for attacks
     * @param _bridge The bridge contract to attack
     */
    function setTargetBridge(address _bridge) external {
        bridge = IUMALayerZeroBridge(_bridge);
    }

    /**
     * @notice Set the bond token for attacks
     * @param _bondToken The bond token address
     */
    function setBondToken(address _bondToken) external {
        bondToken = IERC20(_bondToken);
    }

    /**
     * @notice Attempt a reentrancy attack on bond deposit
     * @param amount The amount to deposit
     */
    function attackBondDeposit(uint256 amount) external {
        if (!attackInProgress) {
            attackInProgress = true;
            attackCount = 0;

            // First call to depositBond
            bridge.depositBond(address(bondToken), amount);

            attackInProgress = false;
        } else {
            // This is the reentrant call
            attackCount++;

            // Try to call depositBond again during the first call
            try bridge.depositBond(address(bondToken), amount) {
                // If this succeeds, there's a reentrancy vulnerability
                revert("Reentrancy attack succeeded!");
            } catch {
                // Expected to fail due to nonReentrant modifier
            }
        }
    }

    /**
     * @notice Attempt a reentrancy attack on withdrawal
     * @param amount The amount to withdraw
     */
    function attackWithdrawal(uint256 amount) external {
        if (!attackInProgress) {
            attackInProgress = true;
            attackCount = 0;

            // First call to executeWithdrawal
            bridge.executeWithdrawal(address(bondToken));

            attackInProgress = false;
        } else {
            // This is the reentrant call
            attackCount++;

            // Try to call executeWithdrawal again during the first call
            try bridge.executeWithdrawal(address(bondToken)) {
                // If this succeeds, there's a reentrancy vulnerability
                revert("Reentrancy attack succeeded!");
            } catch {
                // Expected to fail due to nonReentrant modifier
            }
        }
    }

    /**
     * @notice Attempt a reentrancy attack on UMA callback
     * @param assertionId The assertion ID
     */
    function attackUMACallback(bytes32 assertionId) external {
        if (!attackInProgress) {
            attackInProgress = true;
            attackCount = 0;

            // First call to assertionResolvedCallback
            bridge.assertionResolvedCallback(assertionId, true);

            attackInProgress = false;
        } else {
            // This is the reentrant call
            attackCount++;

            // Try to call assertionResolvedCallback again during the first call
            try bridge.assertionResolvedCallback(assertionId, true) {
                // If this succeeds, there's a reentrancy vulnerability
                revert("Reentrancy attack succeeded!");
            } catch {
                // Expected to fail due to nonReentrant modifier
            }
        }
    }

    /**
     * @notice Attempt a cross-function reentrancy attack
     * @param amount The amount for deposit
     */
    function attackCrossFunction(uint256 amount) external {
        if (!attackInProgress) {
            attackInProgress = true;
            attackCount = 0;

            // First call to depositBond
            bridge.depositBond(address(bondToken), amount);

            attackInProgress = false;
        } else {
            // This is the reentrant call
            attackCount++;

            // Try to call a different function during the first call
            try bridge.intentToWithdrawBond(address(bondToken), amount) {
                // If this succeeds, there's a cross-function reentrancy vulnerability
                revert("Cross-function reentrancy attack succeeded!");
            } catch {
                // Expected to fail due to nonReentrant modifier
            }
        }
    }

    /**
     * @notice Get the attack statistics
     * @return _attackInProgress Whether an attack is currently in progress
     * @return _attackCount Number of reentrant calls attempted
     */
    function getAttackStats() external view returns (bool _attackInProgress, uint256 _attackCount) {
        return (attackInProgress, attackCount);
    }

    /**
     * @notice Reset attack state
     */
    function resetAttack() external {
        attackInProgress = false;
        attackCount = 0;
    }

    /**
     * @notice Receive function to accept ETH
     */
    receive() external payable {
        // This can be used to trigger reentrancy attacks
        if (attackInProgress) {
            attackCount++;
        }
    }

    /**
     * @notice Fallback function
     */
    fallback() external payable {
        // This can be used to trigger reentrancy attacks
        if (attackInProgress) {
            attackCount++;
        }
    }
}
