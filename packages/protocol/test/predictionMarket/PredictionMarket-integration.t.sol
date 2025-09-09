// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "cannon-std/Cannon.sol";
// Local interface to avoid IERC20 conflicts
interface IMintableToken {
    function mint(uint256 amount, address to) external;
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}
import "../../src/predictionMarket/PredictionMarket.sol";
import "../../src/predictionMarket/resolvers/PredictionMarketSapienceResolver.sol";
import "../../src/predictionMarket/interfaces/IPredictionStructs.sol";
import "../../src/marketGroupFactory/MarketGroupFactory.sol";
import "../../src/market/interfaces/ISapience.sol";
import "../../src/market/interfaces/ISapienceStructs.sol";
import "./MockERC20.sol";
import "../../src/market/libraries/DecimalMath.sol";
import "../../src/market/libraries/DecimalPrice.sol";
import "../../src/market/external/univ3/TickMath.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";

/**
 * @title PredictionMarketSapienceIntegrationTest
 * @notice Integration test for PredictionMarket using PredictionMarketSapienceResolver with real Sapience markets
 */
contract PredictionMarketSapienceIntegrationTest is Test {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    // Core contracts
    PredictionMarket public predictionMarket;
    PredictionMarketSapienceResolver public sapienceResolver;
    MarketGroupFactory public marketGroupFactory;
    ISapience public marketGroup1;
    ISapience public marketGroup2;

    // Tokens
    MockERC20 public predictionCollateralToken;
    IMintableToken public sapienceCollateralToken;
    IMintableToken public bondCurrency;

    // Test accounts
    address public owner;
    address public maker;
    address public taker;
    address public marketCreator;
    
    // Private keys for signing
    uint256 public constant MAKER_PRIVATE_KEY = 0x1;
    uint256 public constant TAKER_PRIVATE_KEY = 0x2;

    // Constants
    uint256 public constant MIN_COLLATERAL = 1000e18;
    uint256 public constant MAKER_COLLATERAL = 2000e18;
    uint256 public constant TAKER_COLLATERAL = 1500e18;
    uint256 public constant MIN_TRADE_SIZE = 10_000;
    uint256 public constant BOND_AMOUNT = 100 ether;
    uint256 public constant MAX_PREDICTION_MARKETS = 5;

    // Uniswap addresses (from Cannon)
    address public uniswapPositionManager;
    address public uniswapSwapRouter;
    address public uniswapQuoter;
    address public optimisticOracleV3;

    // Market data
    uint256 public market1Id;
    uint256 public market2Id;
    uint160 public constant INITIAL_SQRT_PRICE = 250541448375047946302209916928; // Price = 10
    int24 public constant MIN_TICK = 6800;  // Price = 2.0
    int24 public constant MAX_TICK = 27000; // Price = 15.0
    // These will be set dynamically based on actual market bounds
    uint160 public settlementSqrtPriceYes;
    uint160 public settlementSqrtPriceNo;

    function setUp() public {
        // Get addresses from Cannon deployment
        marketGroupFactory = MarketGroupFactory(vm.getAddress("MarketGroupFactory"));
        sapienceCollateralToken = IMintableToken(vm.getAddress("CollateralAsset.Token"));
        bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));
        uniswapPositionManager = vm.getAddress("Uniswap.NonfungiblePositionManager");
        uniswapSwapRouter = vm.getAddress("Uniswap.SwapRouter");
        uniswapQuoter = vm.getAddress("Uniswap.QuoterV2");
        optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");

        // Create test accounts
        owner = makeAddr("owner");
        maker = vm.addr(MAKER_PRIVATE_KEY);
        taker = vm.addr(TAKER_PRIVATE_KEY);
        marketCreator = makeAddr("marketCreator");

        // Deploy prediction market collateral token (separate from Sapience collateral)
        predictionCollateralToken = new MockERC20("Prediction Collateral", "PCOL", 18);

        // Deploy PredictionMarket
        predictionMarket = new PredictionMarket(
            "Prediction Market NFT",
            "PMT",
            address(predictionCollateralToken),
            MIN_COLLATERAL
        );

        // Deploy PredictionMarketSapienceResolver
        sapienceResolver = new PredictionMarketSapienceResolver(
            PredictionMarketSapienceResolver.Settings({
                maxPredictionMarkets: MAX_PREDICTION_MARKETS
            })
        );

        // Create Sapience market groups using MarketGroupFactory
        vm.startPrank(marketCreator);
        
        // Create first market group
        address marketGroup1Address = marketGroupFactory.cloneAndInitializeMarketGroup(
            address(sapienceCollateralToken),
            MIN_TRADE_SIZE,
            false,
            ISapienceStructs.MarketParams({
                feeRate: 10000,
                assertionLiveness: 21600,
                bondCurrency: address(bondCurrency),
                bondAmount: BOND_AMOUNT,
                uniswapPositionManager: uniswapPositionManager,
                uniswapSwapRouter: uniswapSwapRouter,
                uniswapQuoter: uniswapQuoter,
                optimisticOracleV3: optimisticOracleV3
            }),
            0
        );
        
        // Create second market group
        address marketGroup2Address = marketGroupFactory.cloneAndInitializeMarketGroup(
            address(sapienceCollateralToken),
            MIN_TRADE_SIZE,
            false,
            ISapienceStructs.MarketParams({
                feeRate: 10000,
                assertionLiveness: 21600,
                bondCurrency: address(bondCurrency),
                bondAmount: BOND_AMOUNT,
                uniswapPositionManager: uniswapPositionManager,
                uniswapSwapRouter: uniswapSwapRouter,
                uniswapQuoter: uniswapQuoter,
                optimisticOracleV3: optimisticOracleV3
            }),
            1
        );

        marketGroup1 = ISapience(marketGroup1Address);
        marketGroup2 = ISapience(marketGroup2Address);

        // Create Yes/No markets in both market groups
        market1Id = _createYesNoMarket(
            marketGroup1,
            "Bitcoin reaches $200,000 by end of 2025",
            "Bitcoin doesn't reach $200,000 by end of 2025"
        );
        
        market2Id = _createYesNoMarket(
            marketGroup2,
            "Ethereum reaches $10,000 by end of 2025",
            "Ethereum doesn't reach $10,000 by end of 2025"
        );
        
        vm.stopPrank();

        // Setup test token balances
        predictionCollateralToken.mint(maker, MAKER_COLLATERAL * 10);
        predictionCollateralToken.mint(taker, TAKER_COLLATERAL * 10);
        
        // Skip bond currency minting for now - the test might not need it
        // or we can use a different approach to get bond currency tokens
        bondCurrency.mint(BOND_AMOUNT * 2, marketCreator);
        bondCurrency.mint(BOND_AMOUNT * 2, address(sapienceResolver));

        // Set settlement prices based on actual market bounds
        (ISapienceStructs.MarketData memory market1Data, ) = marketGroup1.getMarket(market1Id);
        (ISapienceStructs.MarketData memory market2Data, ) = marketGroup2.getMarket(market2Id);
        
        // Use the actual min/max prices from the market
        // Convert the min/max prices to sqrt prices using TickMath
        settlementSqrtPriceYes = TickMath.getSqrtRatioAtTick(market1Data.baseAssetMaxPriceTick);
        settlementSqrtPriceNo = TickMath.getSqrtRatioAtTick(market1Data.baseAssetMinPriceTick);
        
        console.log("=== Integration Test Setup Complete ===");
        console.log("PredictionMarket:", address(predictionMarket));
        console.log("SapienceResolver:", address(sapienceResolver));
        console.log("MarketGroup1:", address(marketGroup1));
        console.log("MarketGroup2:", address(marketGroup2));
        console.log("Market1 ID:", market1Id);
        console.log("Market2 ID:", market2Id);
        console.log("Market1 minPriceD18:", market1Data.minPriceD18);
        console.log("Market1 maxPriceD18:", market1Data.maxPriceD18);
        console.log("Settlement sqrt price YES:", settlementSqrtPriceYes);
        console.log("Settlement sqrt price NO:", settlementSqrtPriceNo);
        console.log("=====================================");
    }

    function test_fullIntegrationFlow_makerWins() public {
        console.log("\n=== Testing Full Integration Flow - Maker Wins ===");
        
        // 1. Create prediction outcomes
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = 
            new PredictionMarketSapienceResolver.PredictedOutcome[](2);
        
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(marketGroup1),
                marketId: market1Id
            }),
            prediction: true // Maker predicts YES for Bitcoin
        });
        
        outcomes[1] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(marketGroup2),
                marketId: market2Id
            }),
            prediction: false // Maker predicts NO for Ethereum
        });

        bytes memory encodedOutcomes = sapienceResolver.encodePredictionOutcomes(outcomes);

        // Log initial balances before prediction creation
        uint256 initialMakerBalance = predictionCollateralToken.balanceOf(maker);
        uint256 initialTakerBalance = predictionCollateralToken.balanceOf(taker);

        // 2. Create and mint prediction
        (uint256 makerNftId, uint256 takerNftId) = _createPrediction(encodedOutcomes);

        // Log balances after prediction creation to calculate deposits
        uint256 finalMakerBalance = predictionCollateralToken.balanceOf(maker);
        uint256 finalTakerBalance = predictionCollateralToken.balanceOf(taker);

        uint256 makerDeposit = initialMakerBalance - finalMakerBalance;
        uint256 takerDeposit = initialTakerBalance - finalTakerBalance;

        console.log("Prediction created - Maker NFT:", makerNftId, "Taker NFT:", takerNftId);
        console.log("Maker deposited:", makerDeposit, "collateral tokens");
        console.log("Taker deposited:", takerDeposit, "collateral tokens");

        // 3. Settle Sapience markets to match maker's predictions
        _settleMarket(marketGroup1, market1Id, true);  // Bitcoin YES
        _settleMarket(marketGroup2, market2Id, false); // Ethereum NO

        // 4. Resolve prediction (maker should win)
        uint256 makerBalanceBeforeBurn = predictionCollateralToken.balanceOf(maker);
        
        // Check what the resolver thinks about the prediction
        (bool isValid, IPredictionMarketResolver.Error error, bool makerWon) = sapienceResolver.resolvePrediction(encodedOutcomes);
        
        vm.prank(maker);
        predictionMarket.burn(makerNftId, keccak256("integration-test"));

        uint256 makerBalanceAfterBurn = predictionCollateralToken.balanceOf(maker);
        uint256 payout = makerBalanceAfterBurn - makerBalanceBeforeBurn;

        // Verify maker won and received total collateral
        assertEq(payout, MAKER_COLLATERAL + TAKER_COLLATERAL, "Maker should receive total collateral");
        
        console.log("Maker won! Payout:", payout);
        console.log("=== Integration Test Complete ===\n");
    }

    function test_fullIntegrationFlow_takerWins() public {
        console.log("\n=== Testing Full Integration Flow - Taker Wins ===");
        
        // 1. Create prediction outcomes (same as before)
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = 
            new PredictionMarketSapienceResolver.PredictedOutcome[](2);
        
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(marketGroup1),
                marketId: market1Id
            }),
            prediction: true // Maker predicts YES for Bitcoin
        });
        
        outcomes[1] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(marketGroup2),
                marketId: market2Id
            }),
            prediction: false // Maker predicts NO for Ethereum
        });

        bytes memory encodedOutcomes = sapienceResolver.encodePredictionOutcomes(outcomes);

        // Log initial balances before prediction creation
        uint256 initialMakerBalance = predictionCollateralToken.balanceOf(maker);
        uint256 initialTakerBalance = predictionCollateralToken.balanceOf(taker);

        // 2. Create and mint prediction
        (uint256 makerNftId, uint256 takerNftId) = _createPrediction(encodedOutcomes);

        // Log balances after prediction creation to calculate deposits
        uint256 finalMakerBalance = predictionCollateralToken.balanceOf(maker);
        uint256 finalTakerBalance = predictionCollateralToken.balanceOf(taker);

        uint256 makerDeposit = initialMakerBalance - finalMakerBalance;
        uint256 takerDeposit = initialTakerBalance - finalTakerBalance;

        console.log("Maker deposited:", makerDeposit, "collateral tokens");
        console.log("Taker deposited:", takerDeposit, "collateral tokens");

        // 3. Settle Sapience markets opposite to maker's predictions
        _settleMarket(marketGroup1, market1Id, false); // Bitcoin NO (maker predicted YES)
        _settleMarket(marketGroup2, market2Id, true);  // Ethereum YES (maker predicted NO)

        // 4. Resolve prediction (taker should win)
        uint256 takerBalanceBeforeBurn = predictionCollateralToken.balanceOf(taker);
        
        vm.prank(taker);
        predictionMarket.burn(takerNftId, keccak256("integration-test"));

        uint256 takerBalanceAfterBurn = predictionCollateralToken.balanceOf(taker);
        uint256 payout = takerBalanceAfterBurn - takerBalanceBeforeBurn;

        // Verify taker won and received total collateral
        assertEq(payout, MAKER_COLLATERAL + TAKER_COLLATERAL, "Taker should receive total collateral");
        
        console.log("Taker won! Payout:", payout);
        console.log("=== Integration Test Complete ===\n");
    }

    function test_validationFlow() public {
        console.log("\n=== Testing Validation Flow ===");
        
        // Create prediction outcomes
        PredictionMarketSapienceResolver.PredictedOutcome[] memory outcomes = 
            new PredictionMarketSapienceResolver.PredictedOutcome[](1);
        
        outcomes[0] = PredictionMarketSapienceResolver.PredictedOutcome({
            market: PredictionMarketSapienceResolver.MarketIdentifier({
                marketGroup: address(marketGroup1),
                marketId: market1Id
            }),
            prediction: true
        });

        bytes memory encodedOutcomes = sapienceResolver.encodePredictionOutcomes(outcomes);

        // Test validation before settlement
        (bool isValid, IPredictionMarketResolver.Error error) = sapienceResolver.validatePredictionMarkets(encodedOutcomes);
        assertTrue(isValid, "Markets should be valid before settlement");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.NO_ERROR), "Should have no error");

        // Settle the market
        _settleMarket(marketGroup1, market1Id, true);

        // Test validation after settlement (should fail)
        (isValid, error) = sapienceResolver.validatePredictionMarkets(encodedOutcomes);
        assertFalse(isValid, "Markets should be invalid after settlement");
        assertEq(uint256(error), uint256(IPredictionMarketResolver.Error.MARKET_NOT_OPENED), "Should have market not opened error");

        console.log("Validation flow test complete");
    }

    // ============ Helper Functions ============

    function _createYesNoMarket(
        ISapience marketGroup,
        string memory claimYes,
        string memory claimNo
    ) internal returns (uint256 marketId) {
        marketGroup.createMarket(
            ISapienceStructs.MarketCreationParams({
                startTime: block.timestamp - 1 days,
                endTime: block.timestamp + 30 days,
                startingSqrtPriceX96: INITIAL_SQRT_PRICE,
                baseAssetMinPriceTick: MIN_TICK,
                baseAssetMaxPriceTick: MAX_TICK,
                salt: uint256(keccak256(abi.encode(claimYes, block.timestamp))),
                claimStatementYesOrNumeric: bytes(claimYes),
                claimStatementNo: bytes(claimNo)
            })
        );

        (ISapienceStructs.MarketData memory marketData, ) = marketGroup.getLatestMarket();
        return marketData.marketId;
    }

    function _createPrediction(
        bytes memory encodedOutcomes
    ) internal returns (uint256 makerNftId, uint256 takerNftId) {
        // Approve collateral
        vm.prank(maker);
        predictionCollateralToken.approve(address(predictionMarket), MAKER_COLLATERAL);
        
        vm.prank(taker);
        predictionCollateralToken.approve(address(predictionMarket), TAKER_COLLATERAL);

        // Create mint request
        bytes32 messageHash = keccak256(
            abi.encode(
                encodedOutcomes,
                TAKER_COLLATERAL,
                MAKER_COLLATERAL,
                address(sapienceResolver),
                maker,
                block.timestamp + 1 hours
            )
        );

        bytes32 approvalHash = predictionMarket.getApprovalHash(messageHash, taker);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TAKER_PRIVATE_KEY, approvalHash);
        bytes memory takerSignature = abi.encodePacked(r, s, v);

        IPredictionStructs.MintPredictionRequestData memory mintRequest = 
            IPredictionStructs.MintPredictionRequestData({
                encodedPredictedOutcomes: encodedOutcomes,
                resolver: address(sapienceResolver),
                maker: maker,
                taker: taker,
                makerCollateral: MAKER_COLLATERAL,
                takerCollateral: TAKER_COLLATERAL,
                takerDeadline: block.timestamp + 1 hours,
                takerSignature: takerSignature,
                refCode: keccak256("integration-test")
            });

        // Mint prediction
        vm.prank(maker);
        return predictionMarket.mint(mintRequest);
    }

    function _settleMarket(ISapience marketGroup, uint256 marketId, bool settleAsYes) internal {
        // Get market data
        (ISapienceStructs.MarketData memory marketData, ISapienceStructs.MarketParams memory marketParams) = 
            marketGroup.getMarket(marketId);

        // Advance time past market end
        vm.warp(marketData.endTime + 1);

        // Choose settlement price based on desired outcome
        uint160 settlementSqrtPrice = settleAsYes ? settlementSqrtPriceYes : settlementSqrtPriceNo;

        // Submit settlement price
        vm.startPrank(marketCreator);
        bondCurrency.approve(address(marketGroup), marketParams.bondAmount);
        
        bytes32 assertionId = marketGroup.submitSettlementPrice(
            ISapienceStructs.SettlementPriceParams({
                marketId: marketId,
                asserter: marketCreator,
                settlementSqrtPriceX96: settlementSqrtPrice
            })
        );
        vm.stopPrank();

        // Resolve assertion (simulate UMA callback)
        vm.prank(optimisticOracleV3);
        marketGroup.assertionResolvedCallback(assertionId, true);

        console.log("Market", marketId, "settled as", settleAsYes ? "YES" : "NO");
    }
}