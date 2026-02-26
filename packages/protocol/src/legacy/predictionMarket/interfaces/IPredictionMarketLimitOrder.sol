// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IPredictionStructs.sol";

/**
 * @title IPredictionMarketLimitOrder
 * @notice Main interface for the Prediction Market contract
 */
interface IPredictionMarketLimitOrder {
    // ============ Limit Order ============

    /**
     * @notice Place a new limit order
     * @dev The caller becomes the maker. It will:
     *   1- Validate collateral amounts (maker collateral >= minCollateral, both > 0)
     *   2- Transfer maker collateral to the contract (maker must have approved)
     *   3- Generate a unique order ID and store the order
     *   4- Add order to unfilled order tracking
     *   5- Emit an OrderPlaced event
     * @param orderRequestData The order request data including outcomes, collateral, deadline, etc.
     * @return orderId The unique identifier for this order
     */
    function placeOrder(
        IPredictionStructs.OrderRequestData calldata orderRequestData
    ) external returns (uint256 orderId);

    /**
     * @notice Fill an existing limit order
     * @dev The caller becomes the taker. It will:
     *   1- Validate the order exists and is not expired
     *   2- Transfer taker collateral to the contract (taker must have approved)
     *   3- Create a prediction using the order terms
     *   4- Mint NFTs for both maker and taker
     *   5- Mark the order as filled (removed from unfilled orders)
     *   6- Emit an OrderFilled event
     * @param orderId The order ID to fill
     * @param refCode Reference code for tracking
     */
    function fillOrder(uint256 orderId, bytes32 refCode) external;

    /**
     * @notice Cancel an unfilled limit order
     * @dev Only the order maker can cancel. It will:
     *   1- Validate the order exists
     *   2- Verify the caller is the order maker
     *   3- Return the maker's collateral
     *   4- Mark the order as cancelled (removed from unfilled orders)
     *   5- Emit an OrderCancelled event
     * @param orderId The order ID to cancel
     */
    function cancelOrder(uint256 orderId) external;

    /**
     * @notice Get an unfilled order
     * @param orderId The order id
     * @return order The order
     */
    function getUnfilledOrder(
        uint256 orderId
    ) external view returns (IPredictionStructs.LimitOrderData memory);

    /**
     * @notice Get unfilled orders
     * @return orders The orders
     */
    function getUnfilledOrderIds() external view returns (uint256[] memory);

    /**
     * @notice Get the number of unfilled orders
     * @return count The number of unfilled orders
     */
    function getUnfilledOrdersCount() external view returns (uint256);

    /**
     * @notice Get unfilled orders by maker
     * @param maker The maker
     * @return orders The orders
     */
    function getUnfilledOrderByMaker(
        address maker
    ) external view returns (uint256[] memory);
}
