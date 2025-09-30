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
     * @notice Place a new order
     * @dev it will:
     *   1- validate the order request data
     *   1.1- check if the maker has enough collateral (and transfer it to the contract)
     *   1.2- check if the order is valid
     *   1.3- check if the maker already has an unfilled order
     *   2- store the order request data (with the request id)
     *   3- emit an event with the right information
     * @param orderRequestData The order request data
     */
    function placeOrder(
        IPredictionStructs.OrderRequestData calldata orderRequestData
    ) external returns (uint256 orderId);

    /**
     * @notice Fill an order
     * @dev it will:
     *   1- validate the request id and ref code
     *   1.1- check if the order is unfilled
     *   1.2- check if the order is valid
     *   1.3- check if the order is expired
     *   1.4- check if the taker has enough collateral (and transfer it to the contract)
     *   2- fill the order
     *   3- emit an event with the right information
     * @param orderId The order id
     * @param refCode The ref code
     */
    function fillOrder(uint256 orderId, bytes32 refCode) external;

    /**
     * @notice Cancel an order
     * @dev it will:
     *   1- validate the order id
     *   1.1- check if the order is unfilled
     *   1.2- check if the order is valid
     *   1.3- check if the order is expired
     *   1.4- transfer collateral back to the maker
     *   2- cancel the order
     *   3- emit an event with the right information
     * @param orderId The order id
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
