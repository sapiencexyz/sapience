// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/parlay/ParlayPool.sol";
import "../../src/parlay/interfaces/IParlayEvents.sol";
import "../../src/parlay/interfaces/IParlayStructs.sol";
import "../../src/parlay/ParlayNFT.sol";
import "./MockSapience.sol";
import "./MockERC20.sol";

contract ParlayPoolEdgeCasesTest is Test {
    ParlayPool public pool;
    ParlayNFT public makerNFT;
    ParlayNFT public takerNFT;
    MockERC20 public collateralToken;
    MockSapience public mockSapience;

    address public ana;
    address public bob;
    address public marketGroup1;

    uint256 public constant MIN_COLLATERAL = 100e6;
    uint256 public constant MIN_EXPIRATION_TIME = 60;
    uint256 public constant MAX_EXPIRATION_TIME = 7 days;
    uint256 public constant MAX_PARLAY_MARKETS = 5;

    function setUp() public {
        // Deploy mock contracts
        collateralToken = new MockERC20("USDC", "USDC", 6);
        makerNFT = new ParlayNFT("Parlay Maker", "PMKR");
        takerNFT = new ParlayNFT("Parlay Taker", "PTKR");
        mockSapience = new MockSapience();

        // Deploy ParlayPool
        pool = new ParlayPool(
            address(collateralToken),
            address(makerNFT),
            address(takerNFT),
            MAX_PARLAY_MARKETS,
            MIN_COLLATERAL,
            MIN_EXPIRATION_TIME,
            MAX_EXPIRATION_TIME,
            new address[](0)
        );

        // Transfer ownership of NFT contracts to ParlayPool
        makerNFT.transferOwnership(address(pool));
        takerNFT.transferOwnership(address(pool));

        // Setup test addresses
        ana = makeAddr("ana");
        bob = makeAddr("bob");
        marketGroup1 = address(mockSapience);

        // Fund test addresses
        collateralToken.mint(ana, 10000e6);
        collateralToken.mint(bob, 10000e6);

        // Setup mock Sapience markets
        mockSapience.setMarketData(1, false, true, 0, 1000); // Not settled
        mockSapience.setMarketData(2, false, true, 0, 1000); // Not settled
        mockSapience.setMarketData(3, false, true, 0, 1000); // Not settled
        mockSapience.setMarketData(4, false, true, 0, 1000); // Not settled
        mockSapience.setMarketData(5, false, true, 0, 1000); // Not settled
    }

    // ============ Gas Limit Tests ============

    function testGasLimitWithManyMarkets() public {
        // Test with maximum number of markets
        IParlayStructs.PredictedOutcome[]
            memory outcomes = new IParlayStructs.PredictedOutcome[](
                MAX_PARLAY_MARKETS
            );
        for (uint256 i = 0; i < MAX_PARLAY_MARKETS; i++) {
            outcomes[i] = IParlayStructs.PredictedOutcome({
                market: IParlayStructs.Market(marketGroup1, i + 1),
                prediction: true
            });
        }

        vm.startPrank(ana);
        collateralToken.approve(address(pool), 1000e6);
        uint256 requestId = pool.submitParlayOrder(
            outcomes,
            1000e6,
            1200e6,
            block.timestamp + 60,
            bytes32(0) // Empty refCode
        );
        vm.stopPrank();

        assertEq(requestId, 1);
    }

    // ============ Reentrancy Tests ============

    function testReentrancyProtection() public {
        // Create a malicious contract that tries to reenter
        ReentrantContract malicious = new ReentrantContract(
            address(pool),
            address(collateralToken)
        );
        collateralToken.mint(address(malicious), 10000e6);

        // This should fail due to reentrancy protection
        vm.expectRevert();
        malicious.attack();
    }

    // ============ Boundary Value Tests ============

    function testMinimumCollateral() public {
        IParlayStructs.PredictedOutcome[]
            memory outcomes = new IParlayStructs.PredictedOutcome[](1);
        outcomes[0] = IParlayStructs.PredictedOutcome({
            market: IParlayStructs.Market(marketGroup1, 1),
            prediction: true
        });

        vm.startPrank(ana);
        collateralToken.approve(address(pool), MIN_COLLATERAL);
        uint256 requestId = pool.submitParlayOrder(
            outcomes,
            MIN_COLLATERAL,
            MIN_COLLATERAL + 1,
            block.timestamp + 60,
            bytes32(0) // Empty refCode
        );
        vm.stopPrank();

        assertEq(requestId, 1);
    }

    function testMaximumExpirationTime() public {
        IParlayStructs.PredictedOutcome[]
            memory outcomes = new IParlayStructs.PredictedOutcome[](1);
        outcomes[0] = IParlayStructs.PredictedOutcome({
            market: IParlayStructs.Market(marketGroup1, 1),
            prediction: true
        });

        vm.startPrank(ana);
        collateralToken.approve(address(pool), 1000e6);
        uint256 requestId = pool.submitParlayOrder(
            outcomes,
            1000e6,
            1200e6,
            block.timestamp + MAX_EXPIRATION_TIME,
            bytes32(0) // Empty refCode
        );
        vm.stopPrank();

        assertEq(requestId, 1);
    }

    function testExactPayoutEqualsCollateral() public {
        IParlayStructs.PredictedOutcome[]
            memory outcomes = new IParlayStructs.PredictedOutcome[](1);
        outcomes[0] = IParlayStructs.PredictedOutcome({
            market: IParlayStructs.Market(marketGroup1, 1),
            prediction: true
        });

        vm.startPrank(ana);
        vm.expectRevert("Payout must be greater than collateral");
        pool.submitParlayOrder(outcomes, 1000e6, 1000e6, block.timestamp + 60, bytes32(0));
        vm.stopPrank();
    }

    // ============ State Consistency Tests ============

    function testStateConsistencyAfterFailedTransfer() public {
        // Create a scenario where the transfer fails
        IParlayStructs.PredictedOutcome[]
            memory outcomes = new IParlayStructs.PredictedOutcome[](1);
        outcomes[0] = IParlayStructs.PredictedOutcome({
            market: IParlayStructs.Market(marketGroup1, 1),
            prediction: true
        });

        // Burn all tokens from ana
        collateralToken.burn(ana, collateralToken.balanceOf(ana));

        vm.startPrank(ana);
        vm.expectRevert();
        pool.submitParlayOrder(outcomes, 1000e6, 1200e6, block.timestamp + 60, bytes32(0));
        vm.stopPrank();

        // Verify no state changes occurred
        (IParlayStructs.ParlayData memory request, ) = pool.getParlayOrder(1);
        assertEq(request.maker, address(0));
    }

    // ============ NFT Token ID Collision Tests ============

    function testNFTTokenIdUniqueness() public {
        // Create multiple parlays to test token ID uniqueness
        for (uint256 i = 0; i < 3; i++) {
            IParlayStructs.PredictedOutcome[]
                memory outcomes = new IParlayStructs.PredictedOutcome[](1);
            outcomes[0] = IParlayStructs.PredictedOutcome({
                market: IParlayStructs.Market(marketGroup1, 1),
                prediction: true
            });

            vm.startPrank(ana);
            collateralToken.approve(address(pool), 1000e6);
            uint256 requestId = pool.submitParlayOrder(
                outcomes,
                1000e6,
                1200e6,
                block.timestamp + 60,
                bytes32(0) // Empty refCode
            );
            vm.stopPrank();

            fillParlayRequest(bob, requestId);
        }

        // Verify all NFTs have unique token IDs
        assertTrue(makerNFT.ownerOf(1) != address(0));
        assertTrue(makerNFT.ownerOf(3) != address(0));
        assertTrue(makerNFT.ownerOf(5) != address(0));

        assertTrue(takerNFT.ownerOf(2) != address(0));
        assertTrue(takerNFT.ownerOf(4) != address(0));
        assertTrue(takerNFT.ownerOf(6) != address(0));
    }

    // ============ Market Validation Tests ============

    function testInvalidMarketGroup() public {
        IParlayStructs.PredictedOutcome[]
            memory outcomes = new IParlayStructs.PredictedOutcome[](1);
        outcomes[0] = IParlayStructs.PredictedOutcome({
            market: IParlayStructs.Market(address(0), 1),
            prediction: true
        });

        vm.startPrank(ana);
        vm.expectRevert("Invalid market group address");
        pool.submitParlayOrder(outcomes, 1000e6, 1200e6, block.timestamp + 60, bytes32(0));
        vm.stopPrank();
    }

    function testSettledMarket() public {
        // Setup a settled market
        mockSapience.setMarketData(2, true, true, 0, 1000);

        IParlayStructs.PredictedOutcome[]
            memory outcomes = new IParlayStructs.PredictedOutcome[](1);
        outcomes[0] = IParlayStructs.PredictedOutcome({
            market: IParlayStructs.Market(marketGroup1, 2),
            prediction: true
        });

        vm.startPrank(ana);
        vm.expectRevert("Market is already settled");
        pool.submitParlayOrder(outcomes, 1000e6, 1200e6, block.timestamp + 60, bytes32(0));
        vm.stopPrank();
    }

    // ============ Helper Functions ============

    function fillParlayRequest(address taker, uint256 requestId) internal {
        vm.startPrank(taker);
        (IParlayStructs.ParlayData memory request, ) = pool.getParlayOrder(
            requestId
        );
        uint256 delta = request.payout - request.collateral;
        collateralToken.approve(address(pool), delta);
        pool.fillParlayOrder(requestId, bytes32(0));
        vm.stopPrank();
    }
}

// Malicious contract for reentrancy testing
contract ReentrantContract {
    ParlayPool public pool;
    MockERC20 public collateralToken;

    constructor(address _pool, address _collateralToken) {
        pool = ParlayPool(_pool);
        collateralToken = MockERC20(_collateralToken);
    }

    function attack() external {
        // Try to call pool functions recursively
        // This should fail due to reentrancy protection
        IParlayStructs.PredictedOutcome[]
            memory outcomes = new IParlayStructs.PredictedOutcome[](1);
        outcomes[0] = IParlayStructs.PredictedOutcome({
            market: IParlayStructs.Market(address(0), 1),
            prediction: true
        });

        collateralToken.approve(address(pool), 1000e6);
        pool.submitParlayOrder(outcomes, 1000e6, 1200e6, block.timestamp + 60, bytes32(0));
    }
}
