// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.19;

// import "forge-std/Test.sol";
// import "../../src/parlay/ParlayPool.sol";
// import "../../src/parlay/interfaces/IParlayPool.sol";
// import "../../src/parlay/interfaces/IParlayEvents.sol";
// import "../../src/parlay/interfaces/IParlayStructs.sol";
// import "./MockSapience.sol";
// import "./MockERC20.sol";
// import "./MockResolver.sol";

// contract ParlayPoolTest is Test {
//     ParlayPool public pool;
//     MockERC20 public collateralToken;
//     MockSapience public mockSapience;
//     MockResolver public mockResolver;

//     address public ana;
//     address public bob;
//     address public carl;
//     address public marketGroup1;
//     address public marketGroup2;

//     uint256 public constant MIN_COLLATERAL = 100e6;
//     uint256 public constant MIN_EXPIRATION_TIME = 60;
//     uint256 public constant MAX_EXPIRATION_TIME = 7 days;
//     uint256 public constant MAX_PARLAY_MARKETS = 5;

//     function setUp() public {
//         // Deploy mock contracts
//         collateralToken = new MockERC20("USDC", "USDC", 6);
//         mockSapience = new MockSapience();
//         mockResolver = new MockResolver();

//         // Deploy ParlayPool
//         pool = new ParlayPool(
//             "Parlay Pool NFT", 
//             "PP",
//             address(collateralToken),
//             MAX_PARLAY_MARKETS,
//             MIN_COLLATERAL,
//             MIN_EXPIRATION_TIME,
//             MAX_EXPIRATION_TIME,
//             new address[](0) // No approved takers - anyone can fill
//         );

//         // Setup test addresses
//         ana = makeAddr("ana");
//         bob = makeAddr("bob");
//         carl = makeAddr("carl");
//         marketGroup1 = address(mockSapience);
//         marketGroup2 = address(mockSapience);

//         // Fund test addresses
//         collateralToken.mint(ana, 10000e6);
//         collateralToken.mint(bob, 10000e6);
//         collateralToken.mint(carl, 8000e6);

//         // Setup mock Sapience markets (not settled)
//         mockSapience.setMarketData(1, false, true, 0, 1000); // YES market
//         mockSapience.setMarketData(2, false, true, 0, 1000); // YES market
//         mockSapience.setMarketData(3, false, false, 0, 1000); // NO market
//     }

//     // ============ Helper Functions ============

//     function createParlayRequest(
//         address maker,
//         uint256 collateral,
//         uint256 payout,
//         uint256 expirationTime
//     ) internal returns (uint256 requestId) {
//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](2);
//         outcomes[0] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup1, 1),
//             prediction: true
//         });
//         outcomes[1] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup2, 2),
//             prediction: true
//         });

//         vm.startPrank(maker);
//         collateralToken.approve(address(pool), collateral);
//         requestId = pool.submitParlayOrder(
//             outcomes,
//             address(mockResolver),
//             collateral,
//             payout,
//             expirationTime,
//             bytes32(0) // Empty refCode
//         );
//         vm.stopPrank();
//     }

//     function fillParlayRequest(address taker, uint256 requestId) internal {
//         vm.startPrank(taker);
//         (IParlayStructs.ParlayData memory request, ) = pool.getParlayOrder(
//             requestId
//         );
//         uint256 delta = request.payout - request.collateral;
//         collateralToken.approve(address(pool), delta);
//         pool.fillParlayOrder(requestId, bytes32(0)); // Empty refCode
//         vm.stopPrank();
//     }

//     // ============ Constructor Tests ============

//     function testConstructor() public view {
//         IParlayStructs.Settings memory config = pool.getConfig();
//         assertEq(config.collateralToken, address(collateralToken));
//         assertEq(config.maxParlayMarkets, MAX_PARLAY_MARKETS);
//         assertEq(config.minCollateral, MIN_COLLATERAL);
//         assertEq(config.minRequestExpirationTime, MIN_EXPIRATION_TIME);
//         assertEq(config.maxRequestExpirationTime, MAX_EXPIRATION_TIME);
//     }

//     function testConstructorRevertInvalidCollateralToken() public {
//         vm.expectRevert("Invalid collateral token");
//         new ParlayPool(
//             "a",
//             "a",
//             address(0),
//             MAX_PARLAY_MARKETS,
//             MIN_COLLATERAL,
//             MIN_EXPIRATION_TIME,
//             MAX_EXPIRATION_TIME,
//             new address[](0)
//         );
//     }

//     // ============ Submit Parlay Order Tests ============

//     function testSubmitParlayOrder() public {
//         uint256 collateral = 1000e6;
//         uint256 payout = 1200e6;
//         uint256 expirationTime = block.timestamp + 60;

//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](2);
//         outcomes[0] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup1, 1),
//             prediction: true
//         });
//         outcomes[1] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup2, 2),
//             prediction: true
//         });

//         vm.startPrank(ana);
//         collateralToken.approve(address(pool), collateral);

//         vm.expectEmit(true, true, false, true);
//         emit IParlayEvents.ParlayOrderSubmitted(
//             ana,
//             1,
//             outcomes,
//             collateral,
//             payout,
//             expirationTime,
//             bytes32(0) // Empty refCode
//         );

//         uint256 requestId = pool.submitParlayOrder(
//             outcomes,
//             address(mockResolver),
//             collateral,
//             payout,
//             expirationTime,
//             bytes32(0) // Empty refCode
//         );
//         vm.stopPrank();

//         assertEq(requestId, 1);

//         (
//             IParlayStructs.ParlayData memory request,
//             IParlayStructs.PredictedOutcome[] memory predictedOutcomes
//         ) = pool.getParlayOrder(requestId);
//         assertEq(request.maker, ana);
//         assertEq(request.collateral, collateral);
//         assertEq(request.payout, payout);
//         assertEq(request.orderExpirationTime, expirationTime);
//         assertEq(request.filled, false);
//         assertEq(request.settled, false);
//         assertEq(predictedOutcomes.length, 2);
//     }

//     function testSubmitParlayOrderRevertNoMarkets() public {
//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](0);

//         vm.startPrank(ana);
//         vm.expectRevert("Must have at least one market");
//         pool.submitParlayOrder(outcomes, address(mockResolver), 1000e6, 1200e6, block.timestamp + 60, bytes32(0));
//         vm.stopPrank();
//     }

//     function testSubmitParlayOrderRevertTooManyMarkets() public {
//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](6);
//         for (uint256 i = 0; i < 6; i++) {
//             outcomes[i] = IParlayStructs.PredictedOutcome({
//                 market: IParlayStructs.Market(marketGroup1, i + 1),
//                 prediction: true
//             });
//         }

//         vm.startPrank(ana);
//         vm.expectRevert("Too many markets");
//         pool.submitParlayOrder(outcomes, address(mockResolver), 1000e6, 1200e6, block.timestamp + 60, bytes32(0));
//         vm.stopPrank();
//     }

//     function testSubmitParlayOrderRevertInsufficientCollateral() public {
//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](1);
//         outcomes[0] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup1, 1),
//             prediction: true
//         });

//         vm.startPrank(ana);
//         vm.expectRevert("Collateral below minimum");
//         pool.submitParlayOrder(outcomes, address(mockResolver), 50e6, 1200e6, block.timestamp + 60, bytes32(0));
//         vm.stopPrank();
//     }

//     function testSubmitParlayOrderRevertPayoutNotGreaterThanCollateral()
//         public
//     {
//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](1);
//         outcomes[0] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup1, 1),
//             prediction: true
//         });

//         vm.startPrank(ana);
//         vm.expectRevert("Payout must be greater than collateral");
//         pool.submitParlayOrder(outcomes, address(mockResolver), 1000e6, 1000e6, block.timestamp + 60, bytes32(0));
//         vm.stopPrank();
//     }

//     function testSubmitParlayOrderRevertInvalidMarketGroup() public {
//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](1);
//         outcomes[0] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(address(0), 1),
//             prediction: true
//         });

//         vm.startPrank(ana);
//         collateralToken.approve(address(pool), 1000e6);
//         vm.expectRevert("Invalid market group address");
//         pool.submitParlayOrder(outcomes, address(mockResolver), 1000e6, 1200e6, block.timestamp + 60, bytes32(0));
//         vm.stopPrank();
//     }

//     function testSubmitParlayOrderRevertExpirationInPast() public {
//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](1);
//         outcomes[0] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup1, 1),
//             prediction: true
//         });

//         vm.startPrank(ana);
//         vm.expectRevert("Order expiration must be in future");
//         pool.submitParlayOrder(outcomes, address(mockResolver), 1000e6, 1200e6, block.timestamp - 1, bytes32(0));
//         vm.stopPrank();
//     }

//     // ============ Fill Parlay Order Tests ============

//     function testFillParlayOrder() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );

//         uint256 bobBalanceBefore = collateralToken.balanceOf(bob);
//         uint256 delta = 200e6; // 1200 - 1000

//         vm.startPrank(bob);
//         collateralToken.approve(address(pool), delta);

//         vm.expectEmit(true, true, true, true);
//         emit IParlayEvents.ParlayOrderFilled(
//             requestId,
//             ana,
//             bob,
//             1,
//             2,
//             1000e6,
//             delta,
//             1200e6,
//             bytes32(0)
//         );

//         pool.fillParlayOrder(requestId, bytes32(0)); // Empty refCode
//         vm.stopPrank();

//         (IParlayStructs.ParlayData memory parlay, ) = pool.getParlayOrder(
//             requestId
//         );
//         assertEq(parlay.filled, true);
//         assertEq(parlay.taker, bob);
//         assertEq(parlay.payout, 1200e6);
//         assertEq(parlay.makerNftTokenId, 1);
//         assertEq(parlay.takerNftTokenId, 2);
//         assertEq(parlay.createdAt, block.timestamp);

//         // Check NFT ownership
//         assertEq(pool.ownerOf(1), ana);
//         assertEq(pool.ownerOf(2), bob);

//         // Check token balances
//         assertEq(collateralToken.balanceOf(bob), bobBalanceBefore - delta);
//     }

//     function testFillParlayOrderRevertAlreadyFilled() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         fillParlayRequest(bob, requestId);

//         vm.startPrank(carl);
//         vm.expectRevert("Order already filled");
//         pool.fillParlayOrder(requestId, bytes32(0));
//         vm.stopPrank();
//     }

//     function testFillParlayOrderRevertExpired() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );

//         // Fast forward past expiration
//         vm.warp(block.timestamp + 61);

//         vm.startPrank(bob);
//         vm.expectRevert("Order expired");
//         pool.fillParlayOrder(requestId, bytes32(0));
//         vm.stopPrank();
//     }

//     function testFillParlayOrderRevertInsufficientBalance() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );

//         // Bob has insufficient balance
//         collateralToken.burn(bob, collateralToken.balanceOf(bob) - 100e6);

//         vm.startPrank(bob);
//         vm.expectRevert("Insufficient taker balance");
//         pool.fillParlayOrder(requestId, bytes32(0));
//         vm.stopPrank();
//     }

//     // ============ Settlement Tests ============

//     function testSettleParlayMakerWins() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         fillParlayRequest(bob, requestId);

//         // Settle the underlying markets
//         mockSapience.setMarketData(1, true, true, 0, 1000); // Settle as YES
//         mockSapience.setMarketData(2, true, true, 0, 1000); // Settle as YES

//         // Fast forward 30 days
//         vm.warp(block.timestamp + 30 days);

//         vm.expectEmit(true, true, false, true);
//         emit IParlayEvents.ParlaySettled(1, 2, 1200e6, true);

//         pool.settleParlay(1); // Using maker NFT

//         (IParlayStructs.ParlayData memory parlay, ) = pool.getParlayById(1);
//         assertEq(parlay.settled, true);
//         assertEq(parlay.makerWon, true);
//         assertEq(parlay.payout, 1200e6); // collateral + delta (whole payout)
//     }

//     function testSettleParlayTakerWins() public {
//         // Create a parlay with one wrong prediction
//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](2);
//         outcomes[0] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup1, 1),
//             prediction: true // Correct
//         });
//         outcomes[1] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup1, 3),
//             prediction: true // Wrong - market settles as NO
//         });

//         vm.startPrank(ana);
//         collateralToken.approve(address(pool), 1000e6);
//         uint256 requestId = pool.submitParlayOrder(
//             outcomes,
//             address(mockResolver),
//             1000e6,
//             1200e6,
//             block.timestamp + 60,
//             bytes32(0)
//         );
//         vm.stopPrank();

//         fillParlayRequest(bob, requestId);

//         // Settle the underlying markets
//         mockSapience.setMarketData(1, true, true, 0, 1000); // Settle as YES
//         mockSapience.setMarketData(3, true, false, 0, 1000); // Settle as NO

//         // Fast forward 30 days
//         vm.warp(block.timestamp + 30 days);

//         vm.expectEmit(true, true, false, true);
//         emit IParlayEvents.ParlaySettled(1, 2, 1200e6, false);

//         pool.settleParlay(1);

//         (IParlayStructs.ParlayData memory parlay, ) = pool.getParlayById(1);
//         assertEq(parlay.settled, true);
//         assertEq(parlay.makerWon, false);
//         assertEq(parlay.payout, 1200e6); // collateral + delta (whole payout)
//     }

//     function testSettleParlayRevertNotExpired() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         fillParlayRequest(bob, requestId);

//         // Try to settle before 30 days
//         vm.warp(block.timestamp + 29 days);

//         vm.expectRevert("Parlay not expired yet");
//         pool.settleParlay(1);
//     }

//     function testSettleParlayRevertAlreadySettled() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         fillParlayRequest(bob, requestId);

//         // Settle the underlying markets
//         mockSapience.setMarketData(1, true, true, 0, 1000); // Settle as YES
//         mockSapience.setMarketData(2, true, true, 0, 1000); // Settle as YES

//         // Fast forward 30 days
//         vm.warp(block.timestamp + 30 days);

//         pool.settleParlay(1);

//         vm.expectRevert("Parlay already settled");
//         pool.settleParlay(1);
//     }

//     // ============ Withdrawal Tests ============

//     function testWithdrawParlayCollateralMakerWins() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         fillParlayRequest(bob, requestId);

//         // Settle the underlying markets
//         mockSapience.setMarketData(1, true, true, 0, 1000); // Settle as YES
//         mockSapience.setMarketData(2, true, true, 0, 1000); // Settle as YES

//         // Fast forward 30 days and settle
//         vm.warp(block.timestamp + 30 days);
//         pool.settleParlay(1);

//         uint256 anaBalanceBefore = collateralToken.balanceOf(ana);

//         vm.startPrank(ana);
//         vm.expectEmit(true, true, false, true);
//         emit IParlayEvents.ParlayCollateralWithdrawn(1, ana, 1200e6);

//         pool.withdrawParlayCollateral(1);
//         vm.stopPrank();

//         assertEq(collateralToken.balanceOf(ana), anaBalanceBefore + 1200e6);

//         // Verify payout is reset
//         (IParlayStructs.ParlayData memory parlay, ) = pool.getParlayById(1);
//         assertEq(parlay.payout, 0);
//     }

//     function testWithdrawParlayCollateralTakerWins() public {
//         // Create parlay where maker loses
//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](1);
//         outcomes[0] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup1, 3),
//             prediction: true // Wrong prediction
//         });

//         vm.startPrank(ana);
//         collateralToken.approve(address(pool), 1000e6);
//         uint256 requestId = pool.submitParlayOrder(
//             outcomes,
//             address(mockResolver),
//             1000e6,
//             1200e6,
//             block.timestamp + 60,
//             bytes32(0)
//         );
//         vm.stopPrank();

//         fillParlayRequest(bob, requestId);

//         // Settle the underlying markets
//         mockSapience.setMarketData(3, true, false, 0, 1000); // Settle as NO

//         // Fast forward 30 days and settle
//         vm.warp(block.timestamp + 30 days);
//         pool.settleParlay(1);

//         uint256 bobBalanceBefore = collateralToken.balanceOf(bob);

//         vm.startPrank(bob);
//         vm.expectEmit(true, true, false, true);
//         emit IParlayEvents.ParlayCollateralWithdrawn(2, bob, 1200e6);

//         pool.withdrawParlayCollateral(2); // Using taker NFT
//         vm.stopPrank();

//         assertEq(collateralToken.balanceOf(bob), bobBalanceBefore + 1200e6);
//     }

//     function testWithdrawParlayCollateralRevertNotSettled() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         fillParlayRequest(bob, requestId);

//         vm.startPrank(ana);
//         vm.expectRevert("Parlay not settled");
//         pool.withdrawParlayCollateral(1);
//         vm.stopPrank();
//     }

//     function testWithdrawParlayCollateralRevertNotOwner() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         fillParlayRequest(bob, requestId);

//         // Settle the underlying markets
//         mockSapience.setMarketData(1, true, true, 0, 1000); // Settle as YES
//         mockSapience.setMarketData(2, true, true, 0, 1000); // Settle as YES

//         // Fast forward 30 days and settle
//         vm.warp(block.timestamp + 30 days);
//         pool.settleParlay(1);

//         vm.startPrank(carl);
//         vm.expectRevert("Not NFT owner");
//         pool.withdrawParlayCollateral(1);
//         vm.stopPrank();
//     }

//     function testWithdrawParlayCollateralRevertWrongNFT() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         fillParlayRequest(bob, requestId);

//         // Settle the underlying markets
//         mockSapience.setMarketData(1, true, true, 0, 1000); // Settle as YES
//         mockSapience.setMarketData(2, true, true, 0, 1000); // Settle as YES

//         // Fast forward 30 days and settle
//         vm.warp(block.timestamp + 30 days);
//         pool.settleParlay(1);

//         // Bob tries to withdraw with taker NFT when maker wins (should fail)
//         vm.startPrank(bob);
//         vm.expectRevert("Only maker can withdraw when maker wins");
//         pool.withdrawParlayCollateral(2);
//         vm.stopPrank();
//     }

//     function testWithdrawParlayCollateralRevertDoubleWithdrawal() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         fillParlayRequest(bob, requestId);

//         // Settle the underlying markets
//         mockSapience.setMarketData(1, true, true, 0, 1000); // Settle as YES
//         mockSapience.setMarketData(2, true, true, 0, 1000); // Settle as YES

//         // Fast forward 30 days and settle
//         vm.warp(block.timestamp + 30 days);
//         pool.settleParlay(1);

//         vm.startPrank(ana);
//         pool.withdrawParlayCollateral(1);

//         vm.expectRevert("No payout to withdraw");
//         pool.withdrawParlayCollateral(1);
//         vm.stopPrank();
//     }

//     // ============ Cancel Expired Order Tests ============

//     function testCancelExpiredOrder() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );

//         // Fast forward past expiration
//         vm.warp(block.timestamp + 61);

//         uint256 anaBalanceBefore = collateralToken.balanceOf(ana);

//         vm.startPrank(ana);
//         vm.expectEmit(true, true, false, true);
//         emit IParlayEvents.OrderExpired(requestId, ana, 1000e6);

//         pool.cancelExpiredOrder(requestId);
//         vm.stopPrank();

//         assertEq(collateralToken.balanceOf(ana), anaBalanceBefore + 1000e6);
//     }

//     function testCancelExpiredOrderRevertNotExpired() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );

//         vm.startPrank(ana);
//         vm.expectRevert("Order not expired yet");
//         pool.cancelExpiredOrder(requestId);
//         vm.stopPrank();
//     }

//     function testCancelExpiredOrderRevertAlreadyFilled() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         fillParlayRequest(bob, requestId);

//         vm.startPrank(ana);
//         vm.expectRevert("Request does not exist");
//         pool.cancelExpiredOrder(requestId);
//         vm.stopPrank();
//     }

//     function testCancelExpiredOrderRevertNotMaker() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );

//         // Fast forward past expiration
//         vm.warp(block.timestamp + 61);

//         vm.startPrank(bob);
//         vm.expectRevert("Only maker can cancel expired order");
//         pool.cancelExpiredOrder(requestId);
//         vm.stopPrank();
//     }

//     // ============ View Function Tests ============

//     function testCanFillParlayOrder() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );

//         (bool canFill, uint256 reason) = pool.canFillParlayOrder(requestId);
//         assertEq(canFill, true);
//         assertEq(reason, 0);

//         fillParlayRequest(bob, requestId);

//         (canFill, reason) = pool.canFillParlayOrder(requestId);
//         assertEq(canFill, false);
//         assertEq(reason, 2); // Order already filled
//     }

//     function testCanFillParlayOrderExpired() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );

//         // Fast forward past expiration
//         vm.warp(block.timestamp + 61);

//         (bool canFill, uint256 reason) = pool.canFillParlayOrder(requestId);
//         assertEq(canFill, false);
//         assertEq(reason, 3); // Order expired
//     }

//     // ============ Integration Tests ============

//     function testCompleteParlayFlow() public {
//         // Step 1: Ana submits parlay order
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );

//         // Step 2: Bob fills the order
//         fillParlayRequest(bob, requestId);

//         // Step 3: Settle the underlying markets
//         mockSapience.setMarketData(1, true, true, 0, 1000); // Settle as YES
//         mockSapience.setMarketData(2, true, true, 0, 1000); // Settle as YES

//         // Step 4: Fast forward 30 days and settle parlay
//         vm.warp(block.timestamp + 30 days);
//         pool.settleParlay(1);

//         // Step 5: Ana withdraws winnings
//         vm.startPrank(ana);
//         pool.withdrawParlayCollateral(1);
//         vm.stopPrank();

//         // Verify final state
//         (IParlayStructs.ParlayData memory parlay, ) = pool.getParlayById(1);
//         assertEq(parlay.settled, true);
//         assertEq(parlay.makerWon, true);
//         assertEq(parlay.payout, 0); // Already withdrawn
//     }

//     function testCompetitionBetweenTakers() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );

//         // Both Bob and Carl try to fill the same order
//         vm.startPrank(bob);
//         collateralToken.approve(address(pool), 200e6);
//         pool.fillParlayOrder(requestId, bytes32(0));
//         vm.stopPrank();

//         // Carl's transaction should fail
//         vm.startPrank(carl);
//         collateralToken.approve(address(pool), 200e6);
//         vm.expectRevert("Order already filled");
//         pool.fillParlayOrder(requestId, bytes32(0));
//         vm.stopPrank();

//         // Verify Bob won
//         (IParlayStructs.ParlayData memory parlay, ) = pool.getParlayOrder(
//             requestId
//         );
//         assertEq(parlay.taker, bob);
//         assertEq(pool.ownerOf(2), bob);
//     }

//     // ============ Missing Function Tests ============

//     function testSettleAndWithdrawParlayCollateral() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         fillParlayRequest(bob, requestId);

//         // Settle the underlying markets
//         mockSapience.setMarketData(1, true, true, 0, 1000); // Settle as YES
//         mockSapience.setMarketData(2, true, true, 0, 1000); // Settle as YES

//         // Fast forward 30 days
//         vm.warp(block.timestamp + 30 days);

//         uint256 anaBalanceBefore = collateralToken.balanceOf(ana);

//         vm.startPrank(ana);
//         vm.expectEmit(true, true, false, true);
//         emit IParlayEvents.ParlaySettled(1, 2, 1200e6, true);

//         vm.expectEmit(true, true, false, true);
//         emit IParlayEvents.ParlayCollateralWithdrawn(1, ana, 1200e6);

//         pool.settleAndWithdrawParlayCollateral(1);
//         vm.stopPrank();

//         assertEq(collateralToken.balanceOf(ana), anaBalanceBefore + 1200e6);

//         // Verify final state
//         (IParlayStructs.ParlayData memory parlay, ) = pool.getParlayById(1);
//         assertEq(parlay.settled, true);
//         assertEq(parlay.makerWon, true);
//         assertEq(parlay.payout, 0); // Already withdrawn
//     }

//     function testGetParlay() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         fillParlayRequest(bob, requestId);

//         // Test getParlay with maker NFT
//         (
//             IParlayStructs.ParlayData memory parlayData,
//             IParlayStructs.PredictedOutcome[] memory predictedOutcomes
//         ) = pool.getParlay(1);
//         assertEq(parlayData.maker, ana);
//         assertEq(parlayData.taker, bob);
//         assertEq(parlayData.filled, true);
//         assertEq(predictedOutcomes.length, 2);

//         // Test getParlay with taker NFT
//         (parlayData, predictedOutcomes) = pool.getParlay(2);
//         assertEq(parlayData.maker, ana);
//         assertEq(parlayData.taker, bob);
//         assertEq(parlayData.filled, true);
//         assertEq(predictedOutcomes.length, 2);
//     }

//     function testGetParlayRevertInvalidToken() public {
//         vm.expectRevert("Parlay does not exist");
//         pool.getParlay(999);
//     }

//     // ============ New Function Tests ============

//     function testGetParlayByIds() public {
//         // Create multiple parlays
//         uint256 requestId1 = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         uint256 requestId2 = createParlayRequest(
//             bob,
//             800e6,
//             1000e6,
//             block.timestamp + 60
//         );
//         uint256 requestId3 = createParlayRequest(
//             carl,
//             1500e6,
//             1800e6,
//             block.timestamp + 60
//         );

//         // Fill all parlays
//         fillParlayRequest(bob, requestId1);
//         fillParlayRequest(ana, requestId2);
//         fillParlayRequest(bob, requestId3);

//         // Test getParlayByIds with multiple IDs (all filled)
//         uint256[] memory parlayIds = new uint256[](3);
//         parlayIds[0] = 1; // requestId1
//         parlayIds[1] = 2; // requestId2
//         parlayIds[2] = 3; // requestId3

//         (
//             IParlayStructs.ParlayData[] memory parlayDataList,
//             IParlayStructs.PredictedOutcome[][] memory predictedOutcomesList
//         ) = pool.getParlayByIds(parlayIds);

//         // Verify results
//         assertEq(parlayDataList.length, 3);
//         assertEq(predictedOutcomesList.length, 3);

//         // Check first parlay (filled)
//         assertEq(parlayDataList[0].maker, ana);
//         assertEq(parlayDataList[0].taker, bob);
//         assertEq(parlayDataList[0].filled, true);
//         assertEq(parlayDataList[0].collateral, 1000e6);
//         assertEq(parlayDataList[0].payout, 1200e6);
//         assertEq(predictedOutcomesList[0].length, 2);

//         // Check second parlay (filled)
//         assertEq(parlayDataList[1].maker, bob);
//         assertEq(parlayDataList[1].taker, ana);
//         assertEq(parlayDataList[1].filled, true);
//         assertEq(parlayDataList[1].collateral, 800e6);
//         assertEq(parlayDataList[1].payout, 1000e6);
//         assertEq(predictedOutcomesList[1].length, 2);

//         // Check third parlay (filled)
//         assertEq(parlayDataList[2].maker, carl);
//         assertEq(parlayDataList[2].taker, bob);
//         assertEq(parlayDataList[2].filled, true);
//         assertEq(parlayDataList[2].collateral, 1500e6);
//         assertEq(parlayDataList[2].payout, 1800e6);
//         assertEq(predictedOutcomesList[2].length, 2);
//     }

//     function testGetParlayByIdsWithEmptyArray() view public {
//         uint256[] memory parlayIds = new uint256[](0);

//         (
//             IParlayStructs.ParlayData[] memory parlayDataList,
//             IParlayStructs.PredictedOutcome[][] memory predictedOutcomesList
//         ) = pool.getParlayByIds(parlayIds);

//         assertEq(parlayDataList.length, 0);
//         assertEq(predictedOutcomesList.length, 0);
//     }

//     function testGetParlayByIdsWithUnfilledParlay() public {
//         // Create a parlay but don't fill it
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );

//         uint256[] memory parlayIds = new uint256[](1);
//         parlayIds[0] = requestId; // requestId (unfilled)

//         // Should revert because the parlay is not filled
//         vm.expectRevert("Parlay does not exist");
//         pool.getParlayByIds(parlayIds);
//     }

//     function testGetParlayByIdsWithNonExistentIds() public {
//         uint256[] memory parlayIds = new uint256[](1);
//         parlayIds[0] = 999; // Non-existent

//         // Should revert because the parlay does not exist
//         vm.expectRevert("Parlay does not exist");
//         pool.getParlayByIds(parlayIds);
//     }

//     function testGetParlayByIdsWithMixedFilledAndUnfilled() public {
//         // Create multiple parlays
//         uint256 requestId1 = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         uint256 requestId2 = createParlayRequest(
//             bob,
//             800e6,
//             1000e6,
//             block.timestamp + 60
//         );

//         // Fill only the first parlay
//         fillParlayRequest(bob, requestId1);

//         uint256[] memory parlayIds = new uint256[](2);
//         parlayIds[0] = requestId1; // requestId1 (filled)
//         parlayIds[1] = requestId2; // requestId2 (unfilled)

//         // Should revert because the second parlay is not filled
//         vm.expectRevert("Parlay does not exist");
//         pool.getParlayByIds(parlayIds);
//     }

//     function testGetUnfilledOrderIds() public {
//         // Create multiple parlays
//         uint256 requestId1 = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         uint256 requestId2 = createParlayRequest(
//             bob,
//             800e6,
//             1000e6,
//             block.timestamp + 60
//         );
//         uint256 requestId3 = createParlayRequest(
//             carl,
//             1500e6,
//             1800e6,
//             block.timestamp + 60
//         );

//         // Fill some parlays
//         fillParlayRequest(bob, requestId1);
//         // requestId2 and requestId3 remain unfilled

//         uint256[] memory unfilledOrderIds = pool.getUnfilledOrderIds();

//         // Should return 2 unfilled orders
//         assertEq(unfilledOrderIds.length, 2);

//         // Verify the unfilled order IDs
//         bool foundRequestId1 = false;
//         bool foundRequestId2 = false;
//         bool foundRequestId3 = false;

//         for (uint256 i = 0; i < unfilledOrderIds.length; i++) {
//             if (unfilledOrderIds[i] == requestId1) foundRequestId1 = true;
//             if (unfilledOrderIds[i] == requestId2) foundRequestId2 = true;
//             if (unfilledOrderIds[i] == requestId3) foundRequestId3 = true;
//         }

//         assertTrue(foundRequestId2, "requestId2 should be in unfilled orders");
//         assertTrue(foundRequestId3, "requestId3 should be in unfilled orders");
//         assertFalse(
//             foundRequestId1,
//             "requestId1 should not be in unfilled orders"
//         );
//     }

//     function testGetUnfilledOrderIdsWhenAllFilled() public {
//         // Create and fill a parlay
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         fillParlayRequest(bob, requestId);

//         uint256[] memory unfilledOrderIds = pool.getUnfilledOrderIds();

//         // Should return empty array when all orders are filled
//         assertEq(unfilledOrderIds.length, 0);
//     }

//     function testGetUnfilledOrderIdsWhenNoOrders() view public {
//         uint256[] memory unfilledOrderIds = pool.getUnfilledOrderIds();

//         // Should return empty array when no orders exist
//         assertEq(unfilledOrderIds.length, 0);
//     }

//     function testGetOrderIdsByAddress() public {
//         // Create multiple parlays
//         uint256 requestId1 = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         uint256 requestId2 = createParlayRequest(
//             bob,
//             800e6,
//             1000e6,
//             block.timestamp + 60
//         );
//         uint256 requestId3 = createParlayRequest(
//             carl,
//             1500e6,
//             1800e6,
//             block.timestamp + 60
//         );

//         // Fill some parlays
//         fillParlayRequest(bob, requestId1); // Bob becomes taker for requestId1
//         fillParlayRequest(ana, requestId2); // Ana becomes taker for requestId2

//         // Test Ana's orders (maker of requestId1, taker of requestId2)
//         uint256[] memory anaOrderIds = pool.getOrderIdsByAddress(ana);
//         assertEq(anaOrderIds.length, 2);

//         bool foundRequestId1 = false;
//         bool foundRequestId2 = false;

//         for (uint256 i = 0; i < anaOrderIds.length; i++) {
//             if (anaOrderIds[i] == requestId1) foundRequestId1 = true;
//             if (anaOrderIds[i] == requestId2) foundRequestId2 = true;
//         }

//         assertTrue(foundRequestId1, "Ana should be maker of requestId1");
//         assertTrue(foundRequestId2, "Ana should be taker of requestId2");

//         // Test Bob's orders (maker of requestId2, taker of requestId1)
//         uint256[] memory bobOrderIds = pool.getOrderIdsByAddress(bob);
//         assertEq(bobOrderIds.length, 2);

//         foundRequestId1 = false;
//         foundRequestId2 = false;

//         for (uint256 i = 0; i < bobOrderIds.length; i++) {
//             if (bobOrderIds[i] == requestId1) foundRequestId1 = true;
//             if (bobOrderIds[i] == requestId2) foundRequestId2 = true;
//         }

//         assertTrue(foundRequestId1, "Bob should be taker of requestId1");
//         assertTrue(foundRequestId2, "Bob should be maker of requestId2");

//         // Test Carl's orders (only maker of requestId3)
//         uint256[] memory carlOrderIds = pool.getOrderIdsByAddress(carl);
//         assertEq(carlOrderIds.length, 1);
//         assertEq(carlOrderIds[0], requestId3);
//     }

//     function testGetOrderIdsByAddressForNonParticipant() public {
//         address nonParticipant = makeAddr("nonParticipant");

//         uint256[] memory orderIds = pool.getOrderIdsByAddress(nonParticipant);

//         // Should return empty array for address with no orders
//         assertEq(orderIds.length, 0);
//     }

//     function testGetOrderIdsByAddressWithCanceledOrder() public {
//         // Create a parlay
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );

//         // Cancel the order
//         vm.warp(block.timestamp + 61); // Expire the order
//         vm.startPrank(ana);
//         pool.cancelExpiredOrder(requestId);
//         vm.stopPrank();

//         // Test that canceled orders are not included
//         uint256[] memory anaOrderIds = pool.getOrderIdsByAddress(ana);
//         assertEq(anaOrderIds.length, 0);
//     }

//     function testGetOrderIdsByAddressComplexScenario() public {
//         // Create multiple parlays with complex interactions
//         uint256 requestId1 = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         uint256 requestId2 = createParlayRequest(
//             bob,
//             800e6,
//             1000e6,
//             block.timestamp + 60
//         );
//         uint256 requestId3 = createParlayRequest(
//             carl,
//             1500e6,
//             1800e6,
//             block.timestamp + 60
//         );
//         createParlayRequest(
//             ana,
//             2000e6,
//             2400e6,
//             block.timestamp + 60
//         );

//         // Fill parlays
//         fillParlayRequest(bob, requestId1); // Bob taker for requestId1
//         fillParlayRequest(ana, requestId2); // Ana taker for requestId2
//         fillParlayRequest(bob, requestId3); // Bob taker for requestId3
//         // requestId4 remains unfilled

//         // Test Ana's orders (maker of requestId1 and requestId4, taker of requestId2)
//         uint256[] memory anaOrderIds = pool.getOrderIdsByAddress(ana);
//         assertEq(anaOrderIds.length, 3);

//         // Test Bob's orders (maker of requestId2, taker of requestId1 and requestId3)
//         uint256[] memory bobOrderIds = pool.getOrderIdsByAddress(bob);
//         assertEq(bobOrderIds.length, 3);

//         // Test Carl's orders (maker of requestId3)
//         uint256[] memory carlOrderIds = pool.getOrderIdsByAddress(carl);
//         assertEq(carlOrderIds.length, 1);
//         assertEq(carlOrderIds[0], requestId3);
//     }

//     function testGetOrderIdsByAddressWithZeroAddress() view public {
//         uint256[] memory orderIds = pool.getOrderIdsByAddress(address(0));

//         // Should return empty array for zero address
//         assertEq(orderIds.length, 0);
//     }

//     // ============ Approved Takers Tests ============

//     function testApprovedTakersRestriction() public {
//         // Deploy a new ParlayPool with approved takers
//         address[] memory approvedTakers = new address[](2);
//         approvedTakers[0] = bob;
//         approvedTakers[1] = carl;
        
//         ParlayPool restrictedPool = new ParlayPool(
//             "a",
//             "a",
//             address(collateralToken),
//             MAX_PARLAY_MARKETS,
//             MIN_COLLATERAL,
//             MIN_EXPIRATION_TIME,
//             MAX_EXPIRATION_TIME,
//             approvedTakers
//         );
        
//         // Create a parlay request
//         uint256 requestId = createParlayRequestWithPool(restrictedPool, ana, 1000e6, 1200e6, block.timestamp + 60);
        
//         // Bob (approved) should be able to fill
//         vm.startPrank(bob);
//         collateralToken.approve(address(restrictedPool), 200e6);
//         restrictedPool.fillParlayOrder(requestId, bytes32(0));
//         vm.stopPrank();
        
//         // Verify Bob filled the order
//         (IParlayStructs.ParlayData memory parlay, ) = restrictedPool.getParlayOrder(requestId);
//         assertEq(parlay.taker, bob);
//     }

//     function testApprovedTakersRestrictionUnauthorized() public {
//         // Deploy a new ParlayPool with approved takers
//         address[] memory approvedTakers = new address[](1);
//         approvedTakers[0] = bob;
        
        
//         ParlayPool restrictedPool = new ParlayPool(
//             "a",
//             "a",
//             address(collateralToken),
//             MAX_PARLAY_MARKETS,
//             MIN_COLLATERAL,
//             MIN_EXPIRATION_TIME,
//             MAX_EXPIRATION_TIME,
//             approvedTakers
//         );
        
        
//         // Create a parlay request
//         uint256 requestId = createParlayRequestWithPool(restrictedPool, ana, 1000e6, 1200e6, block.timestamp + 60);
        
//         // Carl (not approved) should not be able to fill
//         vm.startPrank(carl);
//         collateralToken.approve(address(restrictedPool), 200e6);
//         vm.expectRevert("Taker not approved for this order");
//         restrictedPool.fillParlayOrder(requestId, bytes32(0));
//         vm.stopPrank();
//     }

//     function testApprovedTakersEmptyList() public {
//         // Deploy a new ParlayPool with empty approved takers list
//         address[] memory approvedTakers = new address[](0);
        
//         ParlayPool openPool = new ParlayPool(
//             "a",
//             "a",
//             address(collateralToken),
//             MAX_PARLAY_MARKETS,
//             MIN_COLLATERAL,
//             MIN_EXPIRATION_TIME,
//             MAX_EXPIRATION_TIME,
//             approvedTakers
//         );
                
//         // Create a parlay request
//         uint256 requestId = createParlayRequestWithPool(openPool, ana, 1000e6, 1200e6, block.timestamp + 60);
        
//         // Anyone should be able to fill (empty approved list means no restrictions)
//         vm.startPrank(carl);
//         collateralToken.approve(address(openPool), 200e6);
//         openPool.fillParlayOrder(requestId, bytes32(0));
//         vm.stopPrank();
        
//         // Verify Carl filled the order
//         (IParlayStructs.ParlayData memory parlay, ) = openPool.getParlayOrder(requestId);
//         assertEq(parlay.taker, carl);
//     }

//     function testApprovedTakersConfiguration() view public {
//         // Test that the configuration shows the approved takers
//         IParlayStructs.Settings memory config = pool.getConfig();
        
//         // The original pool should have no approved takers (empty list)
//         assertEq(config.collateralToken, address(collateralToken));
//         assertEq(config.maxParlayMarkets, MAX_PARLAY_MARKETS);
//         assertEq(config.minCollateral, MIN_COLLATERAL);
//         assertEq(config.minRequestExpirationTime, MIN_EXPIRATION_TIME);
//         assertEq(config.maxRequestExpirationTime, MAX_EXPIRATION_TIME);
//         assertEq(config.approvedTakers.length, 0);
//     }

//     function testRefCodeInEvents() public {
//         // Test that refCode is properly included in events
//         bytes32 testRefCode = bytes32(uint256(12345)); // Test refCode
        
//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](1);
//         outcomes[0] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup1, 1),
//             prediction: true
//         });

//         vm.startPrank(ana);
//         collateralToken.approve(address(pool), 1000e6);
        
//         // Expect event with refCode
//         vm.expectEmit(true, true, false, true);
//         emit IParlayEvents.ParlayOrderSubmitted(
//             ana,
//             1,
//             outcomes,
//             1000e6,
//             1200e6,
//             block.timestamp + 60,
//             testRefCode
//         );
        
//         uint256 requestId = pool.submitParlayOrder(
//             outcomes,
//             address(mockResolver),
//             1000e6,
//             1200e6,
//             block.timestamp + 60,
//             testRefCode
//         );
//         vm.stopPrank();
        
//         assertEq(requestId, 1);
        
//         // Test fillParlayOrder with refCode
//         vm.startPrank(bob);
//         collateralToken.approve(address(pool), 200e6);
        
//         // Expect event with refCode
//         vm.expectEmit(true, true, true, true);
//         emit IParlayEvents.ParlayOrderFilled(
//             requestId,
//             ana,
//             bob,
//             1,
//             2,
//             1000e6,
//             200e6,
//             1200e6,
//             testRefCode
//         );
        
//         pool.fillParlayOrder(requestId, testRefCode);
//         vm.stopPrank();
        
//         // Verify the parlay was filled
//         (IParlayStructs.ParlayData memory parlay, ) = pool.getParlayOrder(requestId);
//         assertEq(parlay.filled, true);
//         assertEq(parlay.taker, bob);
//     }

//     // Helper function to create parlay request with a specific pool
//     function createParlayRequestWithPool(
//         ParlayPool poolContract,
//         address maker,
//         uint256 collateral,
//         uint256 payout,
//         uint256 expirationTime
//     ) internal returns (uint256 requestId) {
//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](2);
//         outcomes[0] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup1, 1),
//             prediction: true
//         });
//         outcomes[1] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup2, 2),
//             prediction: true
//         });

//         vm.startPrank(maker);
//         collateralToken.approve(address(poolContract), collateral);
//         requestId = poolContract.submitParlayOrder(
//             outcomes,
//             address(mockResolver),
//             collateral,
//             payout,
//             expirationTime,
//             bytes32(0) // Empty refCode
//         );
//         vm.stopPrank();
//     }
// }
