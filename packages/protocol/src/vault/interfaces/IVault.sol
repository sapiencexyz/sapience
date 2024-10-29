// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import "./IResolutionCallback.sol";

interface IVaultAsyncDeposit {
    event DepositRequest(
        address indexed owner,
        uint256 indexed requestedEpochId,
        uint256 assets
    );

    event DepositRequestWithdrawn(
        address indexed owner,
        uint256 indexed requestedEpochId,
        uint256 assets, // current assets after removal
        uint256 assetsReturned
    );

    function requestDeposit(
        uint256 assets
    ) external returns (IVault.UserPendingTransaction memory);

    function withdrawRequestDeposit(
        uint256 assets
    ) external returns (IVault.UserPendingTransaction memory);

    function pendingDepositRequest(
        address owner
    ) external view returns (IVault.UserPendingTransaction memory);

    function claimableDepositRequest(
        address owner
    ) external view returns (uint256 assets);
}

interface IVaultAsyncRedeem {
    event RedeemRequest(
        address indexed owner,
        uint256 indexed requestedEpochId,
        uint256 shares
    );

    event RedeemRequestWithdrawn(
        address indexed owner,
        uint256 indexed requestedEpochId,
        uint256 shares,
        uint256 sharesReturned
    );

    function requestRedeem(
        uint256 shares
    ) external returns (IVault.UserPendingTransaction memory);

    function withdrawRequestRedeem(
        uint256 shares
    ) external returns (IVault.UserPendingTransaction memory);

    function pendingRedeemRequest(
        address owner
    ) external view returns (IVault.UserPendingTransaction memory);

    function claimableRedeemRequest(
        address owner
    ) external view returns (uint256 shares);

    function redeem(address owner) external returns (uint256 assets);
    function withdraw(address owner) external returns (uint256 sharesAmount);
}

interface IVault is
    IERC4626,
    IVaultAsyncDeposit,
    IVaultAsyncRedeem,
    IResolutionCallback
{
    enum TransactionType {
        NULL,
        DEPOSIT,
        WITHDRAW
    }

    struct UserPendingTransaction {
        uint256 amount; // collateral amount or shares amount
        TransactionType transactionType;
        uint256 requestInitiatedEpoch;
    }

    event EpochProcessed(uint256 indexed epochId, uint256 newSharePrice);

    function initializeFirstEpoch(
        uint256 _initialStartTime,
        uint160 _initialSqrtPriceX96
    ) external;

    /**
     * submits the market settlement price
     */
    function submitMarketSettlementPrice(
        uint256 epochId,
        uint160 priceSqrtX96
    ) external returns (bytes32 assertionId);
}
