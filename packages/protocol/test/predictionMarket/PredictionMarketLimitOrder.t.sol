// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/predictionMarket/PredictionMarket.sol";
import "../../src/predictionMarket/interfaces/IPredictionStructs.sol";
import "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";
import "./MockERC20.sol";
import "./MockResolver.sol";

/**
 * @title PredictionMarketLimitOrderTest
 * @notice Comprehensive test suite for PredictionMarket limit order functionality
 */
contract PredictionMarketLimitOrderTest is Test {
    PredictionMarket public predictionMarket;
    MockERC20 public collateralToken;
    MockResolver public mockResolver;
    
    address public maker;
    address public taker;
    address public unauthorizedUser;
    
    uint256 public constant MIN_COLLATERAL = 1000e18;
    uint256 public constant MAKER_COLLATERAL = 2000e18;
    uint256 public constant TAKER_COLLATERAL = 1500e18;
    
    bytes32 public constant ORDER_REF_CODE = keccak256("order-ref-code");
    bytes32 public constant FILL_REF_CODE = keccak256("fill-ref-code");
    bytes public constant ENCODED_OUTCOMES = abi.encode("test-outcomes");
    
    // Events
    event OrderPlaced(
        address indexed maker,
        uint256 indexed orderId,
        bytes encodedPredictedOutcomes,
        address resolver,
        uint256 makerCollateral,
        uint256 takerCollateral,
        bytes32 refCode
    );
    
    event OrderFilled(
        uint256 indexed orderId,
        address indexed maker,
        address indexed taker,
        bytes encodedPredictedOutcomes,
        uint256 makerCollateral,
        uint256 takerCollateral,
        bytes32 refCode
    );
    
    event OrderCancelled(
        uint256 indexed orderId,
        address indexed maker,
        bytes encodedPredictedOutcomes,
        uint256 makerCollateral,
        uint256 takerCollateral
    );

    function setUp() public {
        // Deploy mock contracts
        collateralToken = new MockERC20("Test Token", "TEST", 18);
        mockResolver = new MockResolver();
        
        // Create test accounts with known private keys
        maker = vm.addr(1);
        taker = vm.addr(2);
        unauthorizedUser = vm.addr(3);
        
        // Deploy prediction market
        predictionMarket = new PredictionMarket(
            "Prediction Market",
            "PM",
            address(collateralToken),
            MIN_COLLATERAL
        );
        
        // Mint tokens to test accounts
        collateralToken.mint(maker, 10000e18);
        collateralToken.mint(taker, 10000e18);
        collateralToken.mint(unauthorizedUser, 10000e18);
        
        // Approve prediction market to spend tokens
        vm.prank(maker);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        vm.prank(taker);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        vm.prank(unauthorizedUser);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
    }

    function _createValidOrderRequest() internal view returns (IPredictionStructs.OrderRequestData memory) {
        return IPredictionStructs.OrderRequestData({
            encodedPredictedOutcomes: ENCODED_OUTCOMES,
            orderDeadline: block.timestamp + 1 hours,
            resolver: address(mockResolver),
            makerCollateral: MAKER_COLLATERAL,
            takerCollateral: TAKER_COLLATERAL,
            refCode: ORDER_REF_CODE
        });
    }

    // ============ Place Order Tests ============
    
    function test_placeOrder_success() public {
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        
        uint256 makerBalanceBefore = collateralToken.balanceOf(maker);
        uint256 contractBalanceBefore = collateralToken.balanceOf(address(predictionMarket));
        
        vm.expectEmit(true, true, false, true);
        emit OrderPlaced(
            maker,
            1, // orderId
            ENCODED_OUTCOMES,
            address(mockResolver),
            MAKER_COLLATERAL,
            TAKER_COLLATERAL,
            ORDER_REF_CODE
        );
        
        vm.prank(maker);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        // Verify order ID
        assertEq(orderId, 1);
        
        // Verify collateral transfer
        assertEq(collateralToken.balanceOf(maker), makerBalanceBefore - MAKER_COLLATERAL);
        assertEq(collateralToken.balanceOf(address(predictionMarket)), contractBalanceBefore + MAKER_COLLATERAL);
        
        // Verify order data
        IPredictionStructs.LimitOrderData memory order = predictionMarket.getUnfilledOrder(orderId);
        assertEq(order.orderId, orderId);
        assertEq(order.encodedPredictedOutcomes, ENCODED_OUTCOMES);
        assertEq(order.resolver, address(mockResolver));
        assertEq(order.makerCollateral, MAKER_COLLATERAL);
        assertEq(order.takerCollateral, TAKER_COLLATERAL);
        assertEq(order.maker, maker);
        assertEq(order.taker, address(0));
        assertEq(order.orderDeadline, block.timestamp + 1 hours);
        
        // Verify order tracking
        uint256[] memory orderIds = predictionMarket.getUnfilledOrderIds();
        assertEq(orderIds.length, 1);
        assertEq(orderIds[0], orderId);
        
        uint256[] memory makerOrders = predictionMarket.getUnfilledOrderByMaker(maker);
        assertEq(makerOrders.length, 1);
        assertEq(makerOrders[0], orderId);
        
        assertEq(predictionMarket.getUnfilledOrdersCount(), 1);
    }
    
    function test_placeOrder_makerCollateralZero() public {
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        orderRequest.makerCollateral = 0;
        
        vm.prank(maker);
        vm.expectRevert(PredictionMarket.MakerCollateralMustBeGreaterThanZero.selector);
        predictionMarket.placeOrder(orderRequest);
    }
    
    function test_placeOrder_takerCollateralZero() public {
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        orderRequest.takerCollateral = 0;
        
        vm.prank(maker);
        vm.expectRevert(PredictionMarket.TakerCollateralMustBeGreaterThanZero.selector);
        predictionMarket.placeOrder(orderRequest);
    }
    
    function test_placeOrder_insufficientBalance() public {
        // Create an account with insufficient balance
        address poorMaker = vm.addr(5);
        collateralToken.mint(poorMaker, MAKER_COLLATERAL - 1); // Less than required
        vm.prank(poorMaker);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        
        vm.prank(poorMaker);
        vm.expectRevert(); // ERC20 transfer will fail
        predictionMarket.placeOrder(orderRequest);
    }
    
    function test_placeOrder_multipleOrders() public {
        // Place first order
        IPredictionStructs.OrderRequestData memory orderRequest1 = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId1 = predictionMarket.placeOrder(orderRequest1);
        
        // Place second order
        IPredictionStructs.OrderRequestData memory orderRequest2 = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId2 = predictionMarket.placeOrder(orderRequest2);
        
        // Verify both orders exist
        assertEq(orderId1, 1);
        assertEq(orderId2, 2);
        assertEq(predictionMarket.getUnfilledOrdersCount(), 2);
        
        uint256[] memory orderIds = predictionMarket.getUnfilledOrderIds();
        assertEq(orderIds.length, 2);
        assertEq(orderIds[0], 1);
        assertEq(orderIds[1], 2);
        
        uint256[] memory makerOrders = predictionMarket.getUnfilledOrderByMaker(maker);
        assertEq(makerOrders.length, 2);
        assertEq(makerOrders[0], 1);
        assertEq(makerOrders[1], 2);
    }

    // ============ Fill Order Tests ============
    
    function test_fillOrder_success() public {
        // First place an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        uint256 takerBalanceBefore = collateralToken.balanceOf(taker);
        uint256 contractBalanceBefore = collateralToken.balanceOf(address(predictionMarket));
        
        vm.expectEmit(true, true, true, true);
        emit OrderFilled(
            orderId,
            maker,
            taker,
            ENCODED_OUTCOMES,
            MAKER_COLLATERAL,
            TAKER_COLLATERAL,
            FILL_REF_CODE
        );
        
        vm.prank(taker);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
        
        // Verify collateral transfer
        assertEq(collateralToken.balanceOf(taker), takerBalanceBefore - TAKER_COLLATERAL);
        assertEq(collateralToken.balanceOf(address(predictionMarket)), contractBalanceBefore + TAKER_COLLATERAL);
        
        // Verify order is marked as filled (orderId set to 0)
        IPredictionStructs.LimitOrderData memory order = predictionMarket.getUnfilledOrder(orderId);
        assertEq(order.orderId, 0);
        
        // Verify prediction was created
        uint256[] memory makerPredictions = predictionMarket.getOwnedPredictions(maker);
        uint256[] memory takerPredictions = predictionMarket.getOwnedPredictions(taker);
        assertEq(makerPredictions.length, 1);
        assertEq(takerPredictions.length, 1);
        
        // Verify NFTs were minted
        assertEq(predictionMarket.ownerOf(makerPredictions[0]), maker);
        assertEq(predictionMarket.ownerOf(takerPredictions[0]), taker);
    }
    
    function test_fillOrder_orderNotFound() public {
        // Create a non-existent order ID by using a very high number
        // that won't be treated as expired (deadline would be 0)
        vm.prank(taker);
        vm.expectRevert(PredictionMarket.OrderNotFound.selector);
        predictionMarket.fillOrder(type(uint256).max, FILL_REF_CODE);
    }
    
    function test_fillOrder_orderExpired() public {
        // Place an order with expired deadline
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        orderRequest.orderDeadline = block.timestamp - 1; // Expired
        vm.prank(maker);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        vm.prank(taker);
        vm.expectRevert(PredictionMarket.OrderExpired.selector);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
    }
    
    function test_fillOrder_insufficientTakerBalance() public {
        // Place an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        // Create a taker with insufficient balance
        address poorTaker = vm.addr(6);
        collateralToken.mint(poorTaker, TAKER_COLLATERAL - 1); // Less than required
        vm.prank(poorTaker);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        
        vm.prank(poorTaker);
        vm.expectRevert(); // ERC20 transfer will fail
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
    }
    
    function test_fillOrder_alreadyFilled() public {
        // Place and fill an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        vm.prank(taker);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
        
        // Try to fill the same order again
        vm.prank(taker);
        vm.expectRevert(PredictionMarket.OrderNotFound.selector);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
    }
    
    function test_fillOrder_invalidMarketsAccordingToResolver() public {
        // Place an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        // Make resolver return invalid
        mockResolver.setValidationResult(false, IPredictionMarketResolver.Error.INVALID_MARKET);
        
        vm.prank(taker);
        vm.expectRevert(PredictionMarket.InvalidMarketsAccordingToResolver.selector);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
    }

    // ============ Cancel Order Tests ============
    
    function test_cancelOrder_success() public {
        // Place an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        // Fast forward past the deadline
        vm.warp(block.timestamp + 2 hours);
        
        uint256 makerBalanceBefore = collateralToken.balanceOf(maker);
        uint256 contractBalanceBefore = collateralToken.balanceOf(address(predictionMarket));
        
        vm.expectEmit(true, true, false, true);
        emit OrderCancelled(
            orderId,
            maker,
            ENCODED_OUTCOMES,
            MAKER_COLLATERAL,
            TAKER_COLLATERAL
        );
        
        vm.prank(maker);
        predictionMarket.cancelOrder(orderId);
        
        // Verify collateral refund
        assertEq(collateralToken.balanceOf(maker), makerBalanceBefore + MAKER_COLLATERAL);
        assertEq(collateralToken.balanceOf(address(predictionMarket)), contractBalanceBefore - MAKER_COLLATERAL);
        
        // Verify order is removed from tracking
        assertEq(predictionMarket.getUnfilledOrdersCount(), 0);
        uint256[] memory orderIds = predictionMarket.getUnfilledOrderIds();
        assertEq(orderIds.length, 0);
        
        uint256[] memory makerOrders = predictionMarket.getUnfilledOrderByMaker(maker);
        assertEq(makerOrders.length, 0);
        
        // Verify order is marked as cancelled (orderId set to 0)
        IPredictionStructs.LimitOrderData memory order = predictionMarket.getUnfilledOrder(orderId);
        assertEq(order.orderId, 0);
    }
    
    function test_cancelOrder_orderNotFound() public {
        vm.prank(maker);
        vm.expectRevert(PredictionMarket.OrderNotFound.selector);
        predictionMarket.cancelOrder(999);
    }
    
    function test_cancelOrder_orderNotExpired() public {
        // Place an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        // Try to cancel before deadline
        vm.prank(maker);
        vm.expectRevert(PredictionMarket.OrderNotExpired.selector);
        predictionMarket.cancelOrder(orderId);
    }
    
    function test_cancelOrder_alreadyFilled() public {
        // Place and fill an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        vm.prank(taker);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
        
        // Try to cancel the filled order
        vm.warp(block.timestamp + 2 hours);
        vm.prank(maker);
        vm.expectRevert(PredictionMarket.OrderNotFound.selector);
        predictionMarket.cancelOrder(orderId);
    }

    // ============ View Function Tests ============
    
    function test_getUnfilledOrder() public {
        // Place an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        IPredictionStructs.LimitOrderData memory order = predictionMarket.getUnfilledOrder(orderId);
        assertEq(order.orderId, orderId);
        assertEq(order.encodedPredictedOutcomes, ENCODED_OUTCOMES);
        assertEq(order.resolver, address(mockResolver));
        assertEq(order.makerCollateral, MAKER_COLLATERAL);
        assertEq(order.takerCollateral, TAKER_COLLATERAL);
        assertEq(order.maker, maker);
        assertEq(order.taker, address(0));
        assertEq(order.orderDeadline, block.timestamp + 1 hours);
    }
    
    function test_getUnfilledOrderIds() public {
        // Initially no orders
        uint256[] memory orderIds = predictionMarket.getUnfilledOrderIds();
        assertEq(orderIds.length, 0);
        
        // Place multiple orders
        IPredictionStructs.OrderRequestData memory orderRequest1 = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId1 = predictionMarket.placeOrder(orderRequest1);
        
        IPredictionStructs.OrderRequestData memory orderRequest2 = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId2 = predictionMarket.placeOrder(orderRequest2);
        
        orderIds = predictionMarket.getUnfilledOrderIds();
        assertEq(orderIds.length, 2);
        assertEq(orderIds[0], orderId1);
        assertEq(orderIds[1], orderId2);
    }
    
    function test_getUnfilledOrdersCount() public {
        assertEq(predictionMarket.getUnfilledOrdersCount(), 0);
        
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(maker);
        predictionMarket.placeOrder(orderRequest);
        
        assertEq(predictionMarket.getUnfilledOrdersCount(), 1);
        
        vm.prank(maker);
        predictionMarket.placeOrder(orderRequest);
        
        assertEq(predictionMarket.getUnfilledOrdersCount(), 2);
    }
    
    function test_getUnfilledOrderByMaker() public {
        // Initially no orders
        uint256[] memory makerOrders = predictionMarket.getUnfilledOrderByMaker(maker);
        assertEq(makerOrders.length, 0);
        
        // Place orders
        IPredictionStructs.OrderRequestData memory orderRequest1 = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId1 = predictionMarket.placeOrder(orderRequest1);
        
        IPredictionStructs.OrderRequestData memory orderRequest2 = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId2 = predictionMarket.placeOrder(orderRequest2);
        
        makerOrders = predictionMarket.getUnfilledOrderByMaker(maker);
        assertEq(makerOrders.length, 2);
        assertEq(makerOrders[0], orderId1);
        assertEq(makerOrders[1], orderId2);
        
        // Check another maker has no orders
        uint256[] memory otherMakerOrders = predictionMarket.getUnfilledOrderByMaker(taker);
        assertEq(otherMakerOrders.length, 0);
    }

    // ============ Integration Tests ============
    
    function test_orderLifecycle_placeFillCancel() public {
        // Test complete order lifecycle
        
        // 1. Place order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        assertEq(predictionMarket.getUnfilledOrdersCount(), 1);
        
        // 2. Fill order
        vm.prank(taker);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
        assertEq(predictionMarket.getUnfilledOrdersCount(), 0); // Order removed from count
        
        // 3. Verify prediction was created
        uint256[] memory makerPredictions = predictionMarket.getOwnedPredictions(maker);
        uint256[] memory takerPredictions = predictionMarket.getOwnedPredictions(taker);
        assertEq(makerPredictions.length, 1);
        assertEq(takerPredictions.length, 1);
    }
    
    function test_orderLifecycle_placeCancel() public {
        // Test order placement and cancellation
        
        // 1. Place order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        assertEq(predictionMarket.getUnfilledOrdersCount(), 1);
        
        // 2. Fast forward past deadline
        vm.warp(block.timestamp + 2 hours);
        
        // 3. Cancel order
        vm.prank(maker);
        predictionMarket.cancelOrder(orderId);
        assertEq(predictionMarket.getUnfilledOrdersCount(), 0);
        
        // 4. Verify no predictions were created
        uint256[] memory makerPredictions = predictionMarket.getOwnedPredictions(maker);
        uint256[] memory takerPredictions = predictionMarket.getOwnedPredictions(taker);
        assertEq(makerPredictions.length, 0);
        assertEq(takerPredictions.length, 0);
    }
    
    function test_multipleMakersOrders() public {
        // Test orders from multiple makers
        
        // Setup second maker
        address maker2 = vm.addr(4);
        collateralToken.mint(maker2, 10000e18);
        vm.prank(maker2);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        
        // Place orders from both makers
        IPredictionStructs.OrderRequestData memory orderRequest1 = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId1 = predictionMarket.placeOrder(orderRequest1);
        
        IPredictionStructs.OrderRequestData memory orderRequest2 = _createValidOrderRequest();
        vm.prank(maker2);
        uint256 orderId2 = predictionMarket.placeOrder(orderRequest2);
        
        // Verify both orders exist
        assertEq(predictionMarket.getUnfilledOrdersCount(), 2);
        
        uint256[] memory allOrders = predictionMarket.getUnfilledOrderIds();
        assertEq(allOrders.length, 2);
        
        uint256[] memory maker1Orders = predictionMarket.getUnfilledOrderByMaker(maker);
        assertEq(maker1Orders.length, 1);
        assertEq(maker1Orders[0], orderId1);
        
        uint256[] memory maker2Orders = predictionMarket.getUnfilledOrderByMaker(maker2);
        assertEq(maker2Orders.length, 1);
        assertEq(maker2Orders[0], orderId2);
    }

    // ============ Edge Cases and Error Conditions ============
    
    function test_fillOrder_withDifferentRefCode() public {
        // Place an order
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        bytes32 differentRefCode = keccak256("different-fill-ref-code");
        
        vm.expectEmit(true, true, true, true);
        emit OrderFilled(
            orderId,
            maker,
            taker,
            ENCODED_OUTCOMES,
            MAKER_COLLATERAL,
            TAKER_COLLATERAL,
            differentRefCode
        );
        
        vm.prank(taker);
        predictionMarket.fillOrder(orderId, differentRefCode);
    }
    
    function test_orderIdCounterIncrement() public {
        // Verify order ID counter increments correctly
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        
        vm.prank(maker);
        uint256 orderId1 = predictionMarket.placeOrder(orderRequest);
        assertEq(orderId1, 1);
        
        vm.prank(maker);
        uint256 orderId2 = predictionMarket.placeOrder(orderRequest);
        assertEq(orderId2, 2);
        
        vm.prank(maker);
        uint256 orderId3 = predictionMarket.placeOrder(orderRequest);
        assertEq(orderId3, 3);
    }
    
    function test_collateralTrackingAfterOrderOperations() public {
        // Test collateral tracking through order operations
        
        // Initial state
        assertEq(predictionMarket.getUserCollateralDeposits(maker), 0);
        assertEq(predictionMarket.getUserCollateralDeposits(taker), 0);
        
        // Place order (should not affect user collateral deposits)
        IPredictionStructs.OrderRequestData memory orderRequest = _createValidOrderRequest();
        vm.prank(maker);
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        
        assertEq(predictionMarket.getUserCollateralDeposits(maker), 0);
        assertEq(predictionMarket.getUserCollateralDeposits(taker), 0);
        
        // Fill order (should create prediction and track collateral)
        vm.prank(taker);
        predictionMarket.fillOrder(orderId, FILL_REF_CODE);
        
        assertEq(predictionMarket.getUserCollateralDeposits(maker), MAKER_COLLATERAL);
        assertEq(predictionMarket.getUserCollateralDeposits(taker), TAKER_COLLATERAL);
    }
}
