// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/predictionMarket/resolvers/PredictionMarketSapienceResolver.sol";
import "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";
import "../../src/market/interfaces/ISapience.sol";
import "../../src/market/interfaces/ISapienceStructs.sol";
import "./MockSapience.sol";

/**
 * @title PredictionMarketSapienceResolverTest
 * @notice Comprehensive test suite for PredictionMarketSapienceResolver contract
 */
contract PredictionMarketSapienceResolverTest is Test {
    PredictionMarketSapienceResolver public resolver;
    MockSapience public mockSapience;
    
    address public owner;
    address public unauthorizedUser;
    
    uint256 public constant MAX_PREDICTION_MARKETS = 10;
    uint256 public constant TEST_MARKET_ID = 1;
    uint256 public constant TEST_MARKET_ID_2 = 2;
    
    // Test market data
    uint256 public constant MIN_PRICE = 0;
    uint256 public constant MAX_PRICE = 1e18;
    uint256 public constant SETTLEMENT_PRICE_YES = 1e18; // Max price = YES
    uint256 public constant SETTLEMENT_PRICE_NO = 0; // Min price = NO
    
    event TestEvent();

    function setUp() public {
        // Deploy mock contracts
        mockSapience = new MockSapience();
        
        // Create test accounts
        owner = makeAddr("owner");
        unauthorizedUser = makeAddr("unauthorizedUser");
        
        // Create resolver settings
        PredictionMarketSapienceResolver.Settings memory settings = PredictionMarketSapienceResolver.Settings({
            maxPredictionMarkets: MAX_PREDICTION_MARKETS
        });
        
        // Deploy resolver
        resolver = new PredictionMarketSapienceResolver(settings);
        
        // Setup mock market data
        _setupMockMarket(TEST_MARKET_ID, false, false, MIN_PRICE, MAX_PRICE); // Unsettled market
        _setupMockMarket(TEST_MARKET_ID_2, true, true, MIN_PRICE, MAX_PRICE); // Settled as YES
    }

    function _setupMockMarket(
        uint256 marketId,
        bool settled,
        bool outcome,
        uint256 minPrice,
        uint256 maxPrice
    ) internal {
        uint256 settlementPrice = outcome ? maxPrice : minPrice;
        mockSapience.setMarketData(marketId, settled, outcome, minPrice, maxPrice);
    }

    // ============ Constructor Tests ============
    
    function test_constructor_validParameters() public {
        PredictionMarketSapienceResolver.Settings memory settings = PredictionMarketSapienceResolver.Settings({
            maxPredictionMarkets: 5
        });
        
        PredictionMarketSapienceResolver newResolver = new PredictionMarketSapienceResolver(settings);
        
        // Verify settings
        (uint256 maxPredictionMarkets) = newResolver.config();
        assertEq(maxPredictionMarkets, 5);
    }

    // ============ Validation Tests ============
    
    function test_validatePredictionMarkets_success() public {
        // Create prediction outcomes
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: TEST_MARKET_ID
            }),
            prediction: true
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error) = resolver.validatePredictionMarkets(encodedOutcomes);
        
        assertTrue(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR));
    }
    
    function test_validatePredictionMarkets_noMarkets() public {
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](0);
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        vm.expectRevert(PredictionMarketSapienceResolver.MustHaveAtLeastOneMarket.selector);
        resolver.validatePredictionMarkets(encodedOutcomes);
    }
    
    function test_validatePredictionMarkets_tooManyMarkets() public {
        // Create more markets than allowed
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](MAX_PREDICTION_MARKETS + 1);
        for (uint256 i = 0; i < MAX_PREDICTION_MARKETS + 1; i++) {
            outcomes[i] = PredictionMarketSapienceResolver.PredictedOutcome({
                market: PredictionMarketSapienceResolver.MarketIdentifier({
                    marketGroup: address(mockSapience),
                    marketId: i + 1
                }),
                prediction: true
            });
        }
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        vm.expectRevert(PredictionMarketSapienceResolver.TooManyMarkets.selector);
        resolver.validatePredictionMarkets(encodedOutcomes);
    }
    
    function test_validatePredictionMarkets_invalidMarketGroup() public {
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(0), // Invalid address
                marketId: TEST_MARKET_ID
            }),
            prediction: true
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error) = resolver.validatePredictionMarkets(encodedOutcomes);
        
        assertFalse(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.INVALID_MARKET));
    }
    
    function test_validatePredictionMarkets_marketNotYesNo() public {
        // Setup a numeric market (no claimStatementNo)
        MockSapience numericMarket = new MockSapience();
        numericMarket.setNumericMarketData(TEST_MARKET_ID, false, MIN_PRICE + 1, MIN_PRICE, MAX_PRICE);
        
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(numericMarket),
                marketId: TEST_MARKET_ID
            }),
            prediction: true
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error) = resolver.validatePredictionMarkets(encodedOutcomes);
        
        assertFalse(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.INVALID_MARKET));
    }
    
    function test_validatePredictionMarkets_marketAlreadySettled() public {
        // Use the already settled market
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: TEST_MARKET_ID_2 // This market is already settled
            }),
            prediction: true
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error) = resolver.validatePredictionMarkets(encodedOutcomes);
        
        assertFalse(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.MARKET_NOT_OPENED));
    }

    // ============ Resolution Tests ============
    
    function test_resolvePrediction_success() public {
        // Create prediction outcomes for settled market
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: TEST_MARKET_ID_2
            }),
            prediction: true // Correct prediction (market settled as YES)
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error, bool makerWon) = resolver.resolvePrediction(encodedOutcomes);
        
        assertTrue(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR));
        assertTrue(makerWon);
    }
    
    function test_resolvePrediction_makerLoses() public {
        // Create prediction outcomes for settled market with wrong prediction
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: TEST_MARKET_ID_2
            }),
            prediction: false // Wrong prediction (market settled as YES)
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error, bool makerWon) = resolver.resolvePrediction(encodedOutcomes);
        
        assertTrue(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR));
        assertFalse(makerWon);
    }
    
    function test_resolvePrediction_marketNotSettled() public {
        // Create prediction outcomes for unsettled market
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: TEST_MARKET_ID // This market is not settled
            }),
            prediction: true
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error, bool makerWon) = resolver.resolvePrediction(encodedOutcomes);
        
        assertFalse(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.MARKET_NOT_SETTLED));
        assertTrue(makerWon); // Default value
    }
    
    function test_resolvePrediction_noMarket() public {
        // Create prediction outcomes with invalid market
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(0), // Invalid address
                marketId: TEST_MARKET_ID
            }),
            prediction: true
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        vm.expectRevert(PredictionMarketSapienceResolver.InvalidMarketGroupAddress.selector);
        resolver.resolvePrediction(encodedOutcomes);
    }

    // ============ Multiple Markets Tests ============
    
    function test_multipleMarkets_validation() public {
        // Setup additional unsettled market
        _setupMockMarket(3, false, false, MIN_PRICE, MAX_PRICE); // Unsettled market
        
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](2);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: TEST_MARKET_ID
            }),
            prediction: true
        });
        outcomes[1] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: 3
            }),
            prediction: false
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error) = resolver.validatePredictionMarkets(encodedOutcomes);
        
        assertTrue(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR));
    }
    
    function test_multipleMarkets_resolution() public {
        // Setup additional settled market
        _setupMockMarket(3, true, false, MIN_PRICE, MAX_PRICE); // Settled as NO
        
        // Test resolution with correct predictions
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](2);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: TEST_MARKET_ID_2
            }),
            prediction: true // Correct: market settled as YES
        });
        outcomes[1] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: 3
            }),
            prediction: false // Correct: market settled as NO
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error, bool makerWon) = resolver.resolvePrediction(encodedOutcomes);
        
        assertTrue(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR));
        assertTrue(makerWon);
        
        // Test resolution with one wrong prediction
        outcomes[0].prediction = false; // Wrong prediction for market 1
        
        // Re-encode the outcomes with the updated prediction
        encodedOutcomes = abi.encode(outcomes);
        
        (isValid, error, makerWon) = resolver.resolvePrediction(encodedOutcomes);
        
        assertTrue(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR));
        assertFalse(makerWon); // One wrong prediction
    }

    // ============ Encoding/Decoding Tests ============
    
    function test_encodePredictionOutcomes() public {
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](2);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: TEST_MARKET_ID
            }),
            prediction: true
        });
        outcomes[1] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: TEST_MARKET_ID_2
            }),
            prediction: false
        });
        
        bytes memory encoded = resolver.encodePredictionOutcomes(outcomes);
        
        // Decode and verify
        PredictionMarketSapienceResolver.PredictedOutcome[] memory decoded = resolver.decodePredictionOutcomes(encoded);
        
        assertEq(decoded.length, 2);
        assertEq(decoded[0].market.marketGroup, address(mockSapience));
        assertEq(decoded[0].market.marketId, TEST_MARKET_ID);
        assertTrue(decoded[0].prediction);
        assertEq(decoded[1].market.marketGroup, address(mockSapience));
        assertEq(decoded[1].market.marketId, TEST_MARKET_ID_2);
        assertFalse(decoded[1].prediction);
    }
    
    function test_decodePredictionOutcomes() public {
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: TEST_MARKET_ID
            }),
            prediction: true
        });
        
        bytes memory encoded = abi.encode(outcomes);
        PredictionMarketSapienceResolver.PredictedOutcome[] memory decoded = resolver.decodePredictionOutcomes(encoded);
        
        assertEq(decoded.length, 1);
        assertEq(decoded[0].market.marketGroup, address(mockSapience));
        assertEq(decoded[0].market.marketId, TEST_MARKET_ID);
        assertTrue(decoded[0].prediction);
    }

    // ============ Market Validation Tests ============
    
    function test_isYesNoMarket_validYesNoMarket() public {
        // This test verifies that the internal _isYesNoMarket function works correctly
        // by testing the validation function which uses it internally
        
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: TEST_MARKET_ID
            }),
            prediction: true
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error) = resolver.validatePredictionMarkets(encodedOutcomes);
        
        assertTrue(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR));
    }
    
    function test_getMarketOutcome_settledAsYes() public {
        // Test resolution with market settled as YES
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: TEST_MARKET_ID_2 // Settled as YES
            }),
            prediction: true
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error, bool makerWon) = resolver.resolvePrediction(encodedOutcomes);
        
        assertTrue(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR));
        assertTrue(makerWon);
    }
    
    function test_getMarketOutcome_settledAsNo() public {
        // Setup a market settled as NO
        _setupMockMarket(4, true, false, MIN_PRICE, MAX_PRICE);
        
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: 4 // Settled as NO
            }),
            prediction: false
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error, bool makerWon) = resolver.resolvePrediction(encodedOutcomes);
        
        assertTrue(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR));
        assertTrue(makerWon);
    }
    
    function test_getMarketOutcome_numericMarket() public {
        // Setup a numeric market (settlement price in the middle)
        MockSapience numericMarket = new MockSapience();
        // Set settlement price to middle value (not min or max)
        uint256 middlePrice = (MIN_PRICE + MAX_PRICE) / 2;
        numericMarket.setNumericMarketData(TEST_MARKET_ID, true, middlePrice, MIN_PRICE, MAX_PRICE);
        
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(numericMarket),
                marketId: TEST_MARKET_ID
            }),
            prediction: true
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        vm.expectRevert(PredictionMarketSapienceResolver.MarketIsNotYesNoMarket.selector);
        resolver.resolvePrediction(encodedOutcomes);
    }

    // ============ Edge Cases and Error Conditions ============
    
    function test_zeroMarketId() public {
        // Setup a market with ID 0
        _setupMockMarket(0, false, false, MIN_PRICE, MAX_PRICE);
        
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: 0 // Zero market ID
            }),
            prediction: true
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error) = resolver.validatePredictionMarkets(encodedOutcomes);
        
        // Should still be valid as long as the market group is valid and market exists
        assertTrue(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR));
    }
    
    function test_largeMarketId() public {
        uint256 largeMarketId = type(uint256).max;
        
        // Setup a market with the large ID
        _setupMockMarket(largeMarketId, false, false, MIN_PRICE, MAX_PRICE);
        
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(mockSapience),
                marketId: largeMarketId
            }),
            prediction: true
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error) = resolver.validatePredictionMarkets(encodedOutcomes);
        
        // Should still be valid as long as the market group is valid and market exists
        assertTrue(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR));
    }
    
    function test_emptyEncodedData() public {
        bytes memory emptyData = "";
        
        vm.expectRevert(); // Should revert on empty data
        resolver.validatePredictionMarkets(emptyData);
    }
    
    function test_invalidEncodedData() public {
        bytes memory invalidData = "invalid data";
        
        vm.expectRevert(); // Should revert on invalid data
        resolver.validatePredictionMarkets(invalidData);
    }
    
    function test_maxPredictionMarkets_boundary() public {
        // Setup markets for all the IDs we'll use
        for (uint256 i = 0; i < MAX_PREDICTION_MARKETS; i++) {
            _setupMockMarket(i + 1, false, false, MIN_PRICE, MAX_PRICE);
        }
        
        // Test exactly the maximum number of markets
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](MAX_PREDICTION_MARKETS);
        for (uint256 i = 0; i < MAX_PREDICTION_MARKETS; i++) {
            outcomes[i] = PredictionMarketSapienceResolver.PredictedOutcome({
                market: PredictionMarketSapienceResolver.MarketIdentifier({
                    marketGroup: address(mockSapience),
                    marketId: i + 1
                }),
                prediction: true
            });
        }
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error) = resolver.validatePredictionMarkets(encodedOutcomes);
        
        assertTrue(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR));
    }
    
    function test_differentMarketGroups() public {
        // Test with different market groups
        MockSapience marketGroup1 = new MockSapience();
        MockSapience marketGroup2 = new MockSapience();
        
        marketGroup1.setMarketData(TEST_MARKET_ID, false, false, MIN_PRICE, MAX_PRICE);
        marketGroup2.setMarketData(TEST_MARKET_ID, false, false, MIN_PRICE, MAX_PRICE);
        
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = new PredictionMarketSapienceResolver.PredictedOutcome[](2);
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(marketGroup1),
                marketId: TEST_MARKET_ID
            }),
            prediction: true
        });
        outcomes[1] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(marketGroup2),
                marketId: TEST_MARKET_ID
            }),
            prediction: false
        });
        
        bytes memory encodedOutcomes = abi.encode(outcomes);
        
        (bool isValid, IPredictionMarketResolver.Error error) = resolver.validatePredictionMarkets(encodedOutcomes);
        
        assertTrue(isValid);
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR));
    }
}
