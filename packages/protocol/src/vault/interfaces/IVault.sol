// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "./IERC7540.sol";
import "./IResolutionCallback.sol";

interface IVault is IERC7540, IResolutionCallback {
    /**
     * emitted when a new epoch is processed
     */
    event EpochProcessed(uint256 indexed epochId, uint256 newSharePrice);

    enum TransactionType {
        NULL,
        DEPOSIT,
        WITHDRAW
    }

    /**
     * holds the user pending transaction data
     * @dev notice it only allows one pending transaction per user
     */
    struct UserPendingTransaction {
        TransactionType transactionType; // type of transaction
        uint256 amount; // collateral amount or shares amount
        uint256 requestInitiatedEpoch; // epoch in which the request was initiated
    }

    /**
     * initializes the first epoch.
     * @dev this function can only be called once by the vaultInitializer
     */
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
