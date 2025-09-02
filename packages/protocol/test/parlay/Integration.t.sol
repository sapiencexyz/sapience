// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.19;

// import "forge-std/Test.sol";
// import "../../src/parlay/ParlayPool.sol";
// import "../../src/parlay/interfaces/IParlayEvents.sol";
// import "../../src/parlay/interfaces/IParlayStructs.sol";
// import "./MockSapience.sol";
// import "./MockERC20.sol";
// import "./MockResolver.sol";

// contract ParlayPoolIntegrationTest is Test {
//     ParlayPool public pool;
//     MockERC20 public collateralToken;
//     MockSapience public mockSapience;
//     MockResolver public mockResolver;

//     address public ana;
//     address public bob;
//     address public carl;
//     address public david;
//     address public marketGroup1;
//     address public marketGroup2;
//     address public marketGroup3;

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
//             new address[](0)
//         );

//         // Setup test addresses
//         ana = makeAddr("ana");
//         bob = makeAddr("bob");
//         carl = makeAddr("carl");
//         david = makeAddr("david");
//         marketGroup1 = address(mockSapience);
//         marketGroup2 = address(mockSapience);
//         marketGroup3 = address(mockSapience);

//         // Fund test addresses
//         collateralToken.mint(ana, 10000e6);
//         collateralToken.mint(bob, 10000e6);
//         collateralToken.mint(carl, 10000e6);
//         collateralToken.mint(david, 10000e6);

//         // Setup mock Sapience markets (not settled initially)
//         // marketGroup1 markets (YES outcomes)
//         mockSapience.setMarketData(1, false, true, 0, 1000); // Not settled, YES outcome
//         mockSapience.setMarketData(2, false, true, 0, 1000); // Not settled, YES outcome
//         // marketGroup3 markets (NO outcomes) - using market ID 3
//         mockSapience.setMarketData(3, false, false, 0, 1000); // Not settled, NO outcome
//         // Additional markets for complex tests
//         mockSapience.setMarketData(4, false, true, 0, 1000); // Not settled, YES outcome
//         mockSapience.setMarketData(5, false, false, 0, 1000); // Not settled, NO outcome
//     }

//     // ============ Complete Workflow Tests ============

//     function testCompleteParlayWorkflow() public {
//         // Step 1: Ana submits parlay order
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );

//         // Step 2: Bob fills the order
//         fillParlayRequest(bob, requestId);

//         // Step 3: Fast forward 30 days and settle
//         vm.warp(block.timestamp + 30 days);
//         // Settle the markets first
//         settleMarketsForParlay(1);
//         pool.settleParlay(1);

//         // Step 4: Ana withdraws winnings
//         vm.startPrank(ana);
//         pool.withdrawParlayCollateral(1);
//         vm.stopPrank();

//         // Verify final state
//         (IParlayStructs.ParlayData memory parlay, ) = pool.getParlayById(1);
//         assertEq(parlay.settled, true);
//         assertEq(parlay.makerWon, true);
//         assertEq(parlay.payout, 0); // Already withdrawn
//         assertEq(collateralToken.balanceOf(ana), 10200e6); // 10000 + 1200
//     }

//     function testCompleteParlayWorkflowTakerWins() public {
//         // Create parlay where maker loses
//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](1);
//         outcomes[0] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup3, 3),
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
//             bytes32(0) // Empty refCode
//         );
//         vm.stopPrank();

//         fillParlayRequest(bob, requestId);

//         // Fast forward 30 days and settle
//         vm.warp(block.timestamp + 30 days);
//         // Settle the market first (maker loses)
//         settleMarketsForParlayWithOutcome(1, false);
//         pool.settleParlay(1);

//         // Bob withdraws winnings
//         vm.startPrank(bob);
//         pool.withdrawParlayCollateral(2);
//         vm.stopPrank();

//         // Verify final state
//         (IParlayStructs.ParlayData memory parlay, ) = pool.getParlayById(1);
//         assertEq(parlay.settled, true);
//         assertEq(parlay.makerWon, false);
//         assertEq(parlay.payout, 0); // Already withdrawn
//         assertEq(collateralToken.balanceOf(bob), 11000e6); // 10000 - 200 + 1200
//     }

//     // ============ Multiple Parlays Tests ============

//     function testMultipleParlays() public {
//         // Create multiple parlays
//         uint256[] memory requestIds = new uint256[](3);
//         requestIds[0] = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         requestIds[1] = createParlayRequest(
//             bob,
//             500e6,
//             600e6,
//             block.timestamp + 60
//         );
//         requestIds[2] = createParlayRequest(
//             carl,
//             2000e6,
//             2400e6,
//             block.timestamp + 60
//         );

//         // Fill all parlays
//         fillParlayRequest(david, requestIds[0]);
//         fillParlayRequest(ana, requestIds[1]);
//         fillParlayRequest(bob, requestIds[2]);

//         // Fast forward 30 days and settle all
//         vm.warp(block.timestamp + 30 days);
//         // Ana wins parlay 1, Bob wins parlay 3, Carl wins parlay 5
//         settleMarketsForParlayWithOutcome(1, true); // Ana wins
//         pool.settleParlay(1);
//         settleMarketsForParlayWithOutcome(3, false); // Bob wins (ana loses)
//         pool.settleParlay(3);
//         settleMarketsForParlayWithOutcome(5, true); // Carl wins
//         pool.settleParlay(5);

//         // Withdraw all winnings
//         vm.startPrank(ana);
//         pool.withdrawParlayCollateral(1); // Ana wins parlay 1
//         vm.stopPrank();

//         vm.startPrank(bob);
//         pool.withdrawParlayCollateral(3); // Bob wins parlay 2
//         vm.stopPrank();

//         vm.startPrank(carl);
//         pool.withdrawParlayCollateral(5); // Carl wins parlay 3
//         vm.stopPrank();

//         // Verify all parlays are settled
//         for (uint256 i = 1; i <= 3; i++) {
//             (IParlayStructs.ParlayData memory parlay, ) = pool.getParlayById(i);
//             assertEq(parlay.settled, true);
//         }
//     }

//     // ============ Competition Tests ============

//     function testTakerCompetition() public {
//         uint256 requestId = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );

//         // Multiple takers try to fill the same order
//         vm.startPrank(bob);
//         collateralToken.approve(address(pool), 200e6);
//         pool.fillParlayOrder(requestId, bytes32(0));
//         vm.stopPrank();

//         // Carl's attempt should fail
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

//     // ============ Complex Market Scenarios ============

//     function testComplexParlayWithMultipleMarkets() public {
//         // Create a parlay with 3 markets
//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](3);
//         outcomes[0] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup1, 1),
//             prediction: true
//         });
//         outcomes[1] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup1, 2),
//             prediction: true
//         });
//         outcomes[2] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup3, 3),
//             prediction: false // Correct prediction for NO market
//         });

//         vm.startPrank(ana);
//         collateralToken.approve(address(pool), 1000e6);
//         uint256 requestId = pool.submitParlayOrder(
//             outcomes,
//             address(mockResolver),
//             1000e6,
//             1200e6,
//             block.timestamp + 60,
//             bytes32(0) // Empty refCode
//         );
//         vm.stopPrank();

//         fillParlayRequest(bob, requestId);

//         // Fast forward 30 days and settle
//         vm.warp(block.timestamp + 30 days);
//         // Settle the markets first (maker wins)
//         settleMarketsForParlayWithOutcome(1, true);
//         pool.settleParlay(1);

//         // Ana should win (all predictions correct)
//         vm.startPrank(ana);
//         pool.withdrawParlayCollateral(1);
//         vm.stopPrank();

//         (IParlayStructs.ParlayData memory parlay, ) = pool.getParlayById(1);
//         assertEq(parlay.makerWon, true);
//     }

//     function testComplexParlayWithMixedOutcomes() public {
//         // Create a parlay where some predictions are wrong
//         IParlayStructs.PredictedOutcome[]
//             memory outcomes = new IParlayStructs.PredictedOutcome[](2);
//         outcomes[0] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup1, 1),
//             prediction: true // Correct
//         });
//         outcomes[1] = IParlayStructs.PredictedOutcome({
//             market: IParlayStructs.Market(marketGroup3, 3),
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
//             bytes32(0) // Empty refCode
//         );
//         vm.stopPrank();

//         fillParlayRequest(bob, requestId);

//         // Fast forward 30 days and settle
//         vm.warp(block.timestamp + 30 days);
//         // Settle the markets first (maker loses)
//         settleMarketsForParlayWithOutcome(1, false);
//         pool.settleParlay(1);

//         // Bob should win (maker loses)
//         vm.startPrank(bob);
//         pool.withdrawParlayCollateral(2);
//         vm.stopPrank();

//         (IParlayStructs.ParlayData memory parlay, ) = pool.getParlayById(1);
//         assertEq(parlay.makerWon, false);
//     }

//     // ============ Expiration and Cancellation Tests ============

//     function testOrderExpirationAndCancellation() public {
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
//         pool.cancelExpiredOrder(requestId);
//         vm.stopPrank();

//         assertEq(collateralToken.balanceOf(ana), anaBalanceBefore + 1000e6);

//         // Verify request is cleared
//         (IParlayStructs.ParlayData memory request, ) = pool.getParlayOrder(
//             requestId
//         );
//         assertEq(request.maker, address(0));
//         assertEq(request.collateral, 0);
//     }

//     function testMultipleExpiredOrders() public {
//         // Create multiple orders that will expire
//         uint256 requestId1 = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         uint256 requestId2 = createParlayRequest(
//             bob,
//             500e6,
//             600e6,
//             block.timestamp + 60
//         );
//         uint256 requestId3 = createParlayRequest(
//             carl,
//             2000e6,
//             2400e6,
//             block.timestamp + 60
//         );

//         // Fast forward past expiration
//         vm.warp(block.timestamp + 61);

//         // Cancel all expired orders
//         vm.startPrank(ana);
//         pool.cancelExpiredOrder(requestId1);
//         vm.stopPrank();

//         vm.startPrank(bob);
//         pool.cancelExpiredOrder(requestId2);
//         vm.stopPrank();

//         vm.startPrank(carl);
//         pool.cancelExpiredOrder(requestId3);
//         vm.stopPrank();

//         // Verify all orders are cleared
//         (IParlayStructs.ParlayData memory request1, ) = pool.getParlayOrder(
//             requestId1
//         );
//         (IParlayStructs.ParlayData memory request2, ) = pool.getParlayOrder(
//             requestId2
//         );
//         (IParlayStructs.ParlayData memory request3, ) = pool.getParlayOrder(
//             requestId3
//         );

//         assertEq(request1.maker, address(0));
//         assertEq(request2.maker, address(0));
//         assertEq(request3.maker, address(0));
//     }

//     // ============ State Consistency Tests ============

//     function testStateConsistencyAcrossMultipleOperations() public {
//         // Create and fill multiple parlays
//         uint256 requestId1 = createParlayRequest(
//             ana,
//             1000e6,
//             1200e6,
//             block.timestamp + 60
//         );
//         uint256 requestId2 = createParlayRequest(
//             bob,
//             500e6,
//             600e6,
//             block.timestamp + 60
//         );

//         fillParlayRequest(carl, requestId1);
//         fillParlayRequest(david, requestId2);

//         // Fast forward and settle
//         vm.warp(block.timestamp + 30 days);
//         // Ana wins parlay 1, Carl wins parlay 3
//         settleMarketsForParlayWithOutcome(1, true); // Ana wins
//         pool.settleParlay(1);
//         settleMarketsForParlayWithOutcome(3, false); // Carl wins (bob loses)
//         pool.settleParlay(3);

//         // Withdraw winnings
//         vm.startPrank(ana);
//         pool.withdrawParlayCollateral(1); // Ana wins parlay 1
//         vm.stopPrank();

//         vm.startPrank(bob);
//         pool.withdrawParlayCollateral(3); // Bob wins parlay 2
//         vm.stopPrank();

//         // Verify state consistency
//         (IParlayStructs.ParlayData memory parlay1, ) = pool.getParlayById(1);
//         (IParlayStructs.ParlayData memory parlay2, ) = pool.getParlayById(2);

//         assertEq(parlay1.settled, true);
//         assertEq(parlay1.payout, 0); // Withdrawn
//         assertEq(parlay2.settled, true);
//         assertEq(parlay2.payout, 0); // Withdrawn
//     }

//     // ============ Helper Functions ============

//     function settleMarketsForParlay(uint256 parlayId) internal {
//         // Settle markets based on the parlay's predicted outcomes
//         (, IParlayStructs.PredictedOutcome[] memory outcomes) = pool
//             .getParlayOrder(parlayId);

//         for (uint256 i = 0; i < outcomes.length; i++) {
//             uint256 marketId = outcomes[i].market.marketId;
//             bool expectedOutcome = outcomes[i].prediction;
//             mockSapience.setMarketData(
//                 marketId,
//                 true,
//                 expectedOutcome,
//                 0,
//                 1000
//             );
//         }
//     }

//     function settleMarketsForParlayWithOutcome(
//         uint256 parlayId,
//         bool makerWins
//     ) internal {
//         // Settle markets to make the maker win or lose
//         (, IParlayStructs.PredictedOutcome[] memory outcomes) = pool
//             .getParlayOrder(parlayId);

//         for (uint256 i = 0; i < outcomes.length; i++) {
//             uint256 marketId = outcomes[i].market.marketId;
//             bool prediction = outcomes[i].prediction;
//             // If maker should win, make all predictions correct
//             // If maker should lose, make at least one prediction wrong
//             bool actualOutcome = makerWins
//                 ? prediction
//                 : (i == 0 ? !prediction : prediction);
//             mockSapience.setMarketData(marketId, true, actualOutcome, 0, 1000);
//         }
//     }

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
//             market: IParlayStructs.Market(marketGroup2, 1),
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
// }
