// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/predictionMarket/PredictionMarket.sol";
import "../../src/predictionMarket/interfaces/IPredictionStructs.sol";
import "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";
import "../../src/vault/PassiveLiquidityVault.sol";
import "../../src/vault/interfaces/IPassiveLiquidityVault.sol";
import "./mocks/MockERC20.sol";
import "./mocks/MockResolver.sol";

/**
 * @title PredictionMarketERC1271Test
 * @notice Test suite for ERC-1271 contract signature validation in PredictionMarket
 * @dev Tests that contracts implementing ERC-1271 (like PassiveLiquidityVault) can act as takers
 */
contract PredictionMarketERC1271Test is Test {
    PredictionMarket public predictionMarket;
    MockERC20 public collateralToken;
    MockResolver public mockResolver;
    PassiveLiquidityVault public vault;
    
    address public maker;
    address public vaultManager;
    address public vaultOwner;
    address public user1;
    
    uint256 public constant MAKER_PRIVATE_KEY = 1;
    uint256 public constant MANAGER_PRIVATE_KEY = 2;
    
    uint256 public constant MIN_COLLATERAL = 1000e18;
    uint256 public constant MAKER_COLLATERAL = 2000e18;
    uint256 public constant TAKER_COLLATERAL = 1500e18;
    uint256 public constant TOTAL_COLLATERAL = MAKER_COLLATERAL + TAKER_COLLATERAL;
    
    bytes32 public constant REF_CODE = keccak256("test-ref-code");
    bytes public constant ENCODED_OUTCOMES = abi.encode("test-outcomes");

    event PredictionMinted(
        address indexed maker,
        address indexed taker,
        bytes encodedPredictedOutcomes,
        uint256 makerNftTokenId,
        uint256 takerNftTokenId,
        uint256 makerCollateral,
        uint256 takerCollateral,
        uint256 totalCollateral,
        bytes32 refCode
    );

    function setUp() public {
        // Create test accounts
        maker = vm.addr(MAKER_PRIVATE_KEY);
        vaultManager = vm.addr(MANAGER_PRIVATE_KEY);
        vaultOwner = vm.addr(3);
        user1 = vm.addr(4);
        
        // Deploy mock contracts
        collateralToken = new MockERC20("Test Token", "TEST", 18);
        mockResolver = new MockResolver();
        
        // Deploy prediction market
        predictionMarket = new PredictionMarket(
            "Prediction Market",
            "PM",
            address(collateralToken),
            MIN_COLLATERAL
        );
        
        // Deploy PassiveLiquidityVault with vaultManager as the manager
        vm.prank(vaultOwner);
        vault = new PassiveLiquidityVault(
            address(collateralToken),
            vaultManager, // The manager who can sign on behalf of the vault
            "Test Vault",
            "TV"
        );
        
        // Mint tokens to test accounts
        collateralToken.mint(maker, 10000e18);
        collateralToken.mint(address(vault), 10000e18); // Vault has collateral
        collateralToken.mint(user1, 10000e18);
        
        // Approve prediction market to spend tokens
        vm.prank(maker);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        
        // Vault approves prediction market (max 80% utilization = 8000e18)
        vm.startPrank(vaultManager);
        vault.approveFundsUsage(address(predictionMarket), 8000e18);
        vm.stopPrank();
        
        // Create an initial prediction to consume nonce 0, so tests don't start from zero
        _mintInitialPrediction();
    }
    
    /**
     * @notice Helper to mint an initial prediction with vault as taker (consumes nonce 0)
     */
    function _mintInitialPrediction() internal {
        address initialTaker = vm.addr(5);
        collateralToken.mint(initialTaker, 10000e18);
        vm.prank(initialTaker);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        
        // Create signature for initial taker
        bytes32 messageHash = keccak256(
            abi.encode(
                ENCODED_OUTCOMES,
                TAKER_COLLATERAL,
                MAKER_COLLATERAL,
                address(mockResolver),
                maker,
                block.timestamp + 1 hours,
                0 // This consumes nonce 0
            )
        );
        
        bytes32 approvalHash = predictionMarket.getApprovalHash(messageHash, initialTaker);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(5, approvalHash);
        
        IPredictionStructs.MintPredictionRequestData memory request = IPredictionStructs.MintPredictionRequestData({
            encodedPredictedOutcomes: ENCODED_OUTCOMES,
            resolver: address(mockResolver),
            makerCollateral: MAKER_COLLATERAL,
            takerCollateral: TAKER_COLLATERAL,
            maker: maker,
            taker: initialTaker,
            makerNonce: 0,
            takerSignature: abi.encodePacked(r, s, v),
            takerDeadline: block.timestamp + 1 hours,
            refCode: keccak256("initial-setup")
        });
        
        vm.prank(maker);
        predictionMarket.mint(request);
    }

    /**
     * @notice Helper to create a mint request with vault as taker and manager signature
     */
    function _createMintRequestWithVaultAsTaker() internal view returns (IPredictionStructs.MintPredictionRequestData memory) {
        // Read current nonce from the contract
        uint256 currentNonce = predictionMarket.nonces(maker);
        
        // Create the message hash that will be signed
        bytes32 messageHash = keccak256(
            abi.encode(
                ENCODED_OUTCOMES,
                TAKER_COLLATERAL,
                MAKER_COLLATERAL,
                address(mockResolver),
                maker,
                block.timestamp + 1 hours,
                currentNonce
            )
        );
        
        // The vault will check the signature using its own EIP-712 domain
        // So the manager needs to sign using the vault's getApprovalHash
        bytes32 approvalHash = vault.getApprovalHash(messageHash, vaultManager);
        
        // Sign the approval hash with the manager's private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(MANAGER_PRIVATE_KEY, approvalHash);
        bytes memory takerSignature = abi.encodePacked(r, s, v);
        
        return IPredictionStructs.MintPredictionRequestData({
            encodedPredictedOutcomes: ENCODED_OUTCOMES,
            resolver: address(mockResolver),
            makerCollateral: MAKER_COLLATERAL,
            takerCollateral: TAKER_COLLATERAL,
            maker: maker,
            taker: address(vault), // Vault is the taker
            makerNonce: currentNonce,
            takerSignature: takerSignature, // Signed by manager
            takerDeadline: block.timestamp + 1 hours,
            refCode: REF_CODE
        });
    }

    // ============ Successful ERC-1271 Validation Tests ============

    function test_mint_withVaultAsTaker_managerSignature_succeeds() public {
        IPredictionStructs.MintPredictionRequestData memory request = _createMintRequestWithVaultAsTaker();
        
        uint256 makerBalanceBefore = collateralToken.balanceOf(maker);
        uint256 vaultBalanceBefore = collateralToken.balanceOf(address(vault));
        uint256 contractBalanceBefore = collateralToken.balanceOf(address(predictionMarket));
        
        // Expect event emission (NFT IDs start at 3 and 4 after initial prediction)
        vm.expectEmit(true, true, false, true);
        emit PredictionMinted(
            maker,
            address(vault),
            ENCODED_OUTCOMES,
            3, // makerNftTokenId (after initial prediction used 1 and 2)
            4, // takerNftTokenId
            MAKER_COLLATERAL,
            TAKER_COLLATERAL,
            TOTAL_COLLATERAL,
            REF_CODE
        );
        
        // Mint prediction
        vm.prank(maker);
        (uint256 makerNftTokenId, uint256 takerNftTokenId) = predictionMarket.mint(request);
        
        // Verify NFT IDs (starting after initial prediction NFTs 1 and 2)
        assertEq(makerNftTokenId, 3);
        assertEq(takerNftTokenId, 4);
        
        // Verify collateral was transferred
        assertEq(collateralToken.balanceOf(maker), makerBalanceBefore - MAKER_COLLATERAL);
        assertEq(collateralToken.balanceOf(address(vault)), vaultBalanceBefore - TAKER_COLLATERAL);
        assertEq(collateralToken.balanceOf(address(predictionMarket)), contractBalanceBefore + TOTAL_COLLATERAL);
        
        // Verify NFT ownership
        assertEq(predictionMarket.ownerOf(makerNftTokenId), maker);
        assertEq(predictionMarket.ownerOf(takerNftTokenId), address(vault));
        
        // Verify prediction data
        IPredictionStructs.PredictionData memory prediction = predictionMarket.getPrediction(makerNftTokenId);
        assertEq(prediction.maker, maker);
        assertEq(prediction.taker, address(vault));
        assertEq(prediction.makerCollateral, MAKER_COLLATERAL);
        assertEq(prediction.takerCollateral, TAKER_COLLATERAL);
        assertFalse(prediction.settled);
        
        // Verify user collateral deposits tracking (maker has initial + current prediction)
        assertEq(predictionMarket.getUserCollateralDeposits(maker), MAKER_COLLATERAL * 2);
        assertEq(predictionMarket.getUserCollateralDeposits(address(vault)), TAKER_COLLATERAL);
    }

    function test_mint_withVaultAsTaker_verifyERC1271Called() public {
        IPredictionStructs.MintPredictionRequestData memory request = _createMintRequestWithVaultAsTaker();
        
        // Get current nonce
        uint256 currentNonce = predictionMarket.nonces(maker);
        
        // Create the message hash to verify
        bytes32 messageHash = keccak256(
            abi.encode(
                ENCODED_OUTCOMES,
                TAKER_COLLATERAL,
                MAKER_COLLATERAL,
                address(mockResolver),
                maker,
                block.timestamp + 1 hours,
                currentNonce
            )
        );
        
        // Verify that the vault's isValidSignature would return the correct magic value
        // Use the vault's EIP-712 domain
        bytes32 approvalHash = vault.getApprovalHash(messageHash, vaultManager);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(MANAGER_PRIVATE_KEY, approvalHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        bytes4 result = vault.isValidSignature(messageHash, signature);
        assertEq(uint32(result), uint32(0x1626ba7e)); // IERC1271.isValidSignature.selector
        
        // Now mint with the same signature
        vm.prank(maker);
        (uint256 makerNftTokenId, uint256 takerNftTokenId) = predictionMarket.mint(request);
        
        // Verify prediction was created
        assertGt(makerNftTokenId, 0);
        assertGt(takerNftTokenId, 0);
    }

    function test_burn_withVaultAsTaker_vaultWins() public {
        // First mint a prediction with vault as taker
        IPredictionStructs.MintPredictionRequestData memory request = _createMintRequestWithVaultAsTaker();
        vm.prank(maker);
        (uint256 makerNftTokenId, uint256 takerNftTokenId) = predictionMarket.mint(request);
        
        // Set resolver to return taker (vault) wins
        mockResolver.setResolutionResult(true, IPredictionMarketResolver.Error.NO_ERROR, false);
        
        uint256 vaultBalanceBefore = collateralToken.balanceOf(address(vault));
        
        // Burn and vault should receive the winnings
        vm.prank(address(vault));
        predictionMarket.burn(takerNftTokenId, REF_CODE);
        
        // Verify vault received the total collateral
        assertEq(collateralToken.balanceOf(address(vault)), vaultBalanceBefore + TOTAL_COLLATERAL);
        
        // Verify collateral deposits tracking was updated (maker still has initial prediction collateral)
        assertEq(predictionMarket.getUserCollateralDeposits(maker), MAKER_COLLATERAL);
        assertEq(predictionMarket.getUserCollateralDeposits(address(vault)), 0);
    }

    function test_burn_withVaultAsTaker_makerWins() public {
        // First mint a prediction with vault as taker
        IPredictionStructs.MintPredictionRequestData memory request = _createMintRequestWithVaultAsTaker();
        vm.prank(maker);
        (uint256 makerNftTokenId, uint256 takerNftTokenId) = predictionMarket.mint(request);
        
        // Set resolver to return maker wins
        mockResolver.setResolutionResult(true, IPredictionMarketResolver.Error.NO_ERROR, true);
        
        uint256 makerBalanceBefore = collateralToken.balanceOf(maker);
        
        // Burn and maker should receive the winnings
        vm.prank(maker);
        predictionMarket.burn(makerNftTokenId, REF_CODE);
        
        // Verify maker received the total collateral
        assertEq(collateralToken.balanceOf(maker), makerBalanceBefore + TOTAL_COLLATERAL);
        
        // Verify collateral deposits tracking was updated (maker still has initial prediction collateral)
        assertEq(predictionMarket.getUserCollateralDeposits(maker), MAKER_COLLATERAL);
        assertEq(predictionMarket.getUserCollateralDeposits(address(vault)), 0);
    }

    // ============ Failed ERC-1271 Validation Tests ============

    function test_mint_withVaultAsTaker_wrongSignature_reverts() public {
        IPredictionStructs.MintPredictionRequestData memory request = _createMintRequestWithVaultAsTaker();
        
        // Get current nonce
        uint256 currentNonce = predictionMarket.nonces(maker);
        
        // Create a signature with wrong private key (not the manager)
        bytes32 messageHash = keccak256(
            abi.encode(
                ENCODED_OUTCOMES,
                TAKER_COLLATERAL,
                MAKER_COLLATERAL,
                address(mockResolver),
                maker,
                block.timestamp + 1 hours,
                currentNonce
            )
        );
        
        bytes32 approvalHash = vault.getApprovalHash(messageHash, vaultManager);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(999, approvalHash); // Wrong key
        request.takerSignature = abi.encodePacked(r, s, v);
        
        // Should revert with InvalidTakerSignature
        vm.prank(maker);
        vm.expectRevert(PredictionMarket.InvalidTakerSignature.selector);
        predictionMarket.mint(request);
    }

    function test_mint_withVaultAsTaker_nonManagerSignature_reverts() public {
        IPredictionStructs.MintPredictionRequestData memory request = _createMintRequestWithVaultAsTaker();
        
        // Get current nonce
        uint256 currentNonce = predictionMarket.nonces(maker);
        
        // Sign with a different key (not the vault manager)
        bytes32 messageHash = keccak256(
            abi.encode(
                ENCODED_OUTCOMES,
                TAKER_COLLATERAL,
                MAKER_COLLATERAL,
                address(mockResolver),
                maker,
                block.timestamp + 1 hours,
                currentNonce
            )
        );
        
        bytes32 approvalHash = vault.getApprovalHash(messageHash, vaultManager);
        uint256 randomKey = 12345;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(randomKey, approvalHash);
        request.takerSignature = abi.encodePacked(r, s, v);
        
        // Should revert because signature is not from manager
        vm.prank(maker);
        vm.expectRevert(PredictionMarket.InvalidTakerSignature.selector);
        predictionMarket.mint(request);
    }

    // ============ Multiple Predictions with Vault Tests ============

    function test_multiplePredictions_withVaultAsTaker() public {
        // First prediction with vault as taker
        IPredictionStructs.MintPredictionRequestData memory request1 = _createMintRequestWithVaultAsTaker();
        vm.prank(maker);
        (uint256 makerNftTokenId1, uint256 takerNftTokenId1) = predictionMarket.mint(request1);
        
        // Get the new nonce after first mint
        uint256 currentNonce = predictionMarket.nonces(maker);
        
        // Second prediction with vault as taker (nonce has been incremented)
        bytes32 messageHash2 = keccak256(
            abi.encode(
                ENCODED_OUTCOMES,
                TAKER_COLLATERAL,
                MAKER_COLLATERAL,
                address(mockResolver),
                maker,
                block.timestamp + 1 hours,
                currentNonce
            )
        );
        
        bytes32 approvalHash2 = vault.getApprovalHash(messageHash2, vaultManager);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(MANAGER_PRIVATE_KEY, approvalHash2);
        
        IPredictionStructs.MintPredictionRequestData memory request2 = IPredictionStructs.MintPredictionRequestData({
            encodedPredictedOutcomes: ENCODED_OUTCOMES,
            resolver: address(mockResolver),
            makerCollateral: MAKER_COLLATERAL,
            takerCollateral: TAKER_COLLATERAL,
            maker: maker,
            taker: address(vault),
            makerNonce: currentNonce,
            takerSignature: abi.encodePacked(r, s, v),
            takerDeadline: block.timestamp + 1 hours,
            refCode: REF_CODE
        });
        
        vm.prank(maker);
        (uint256 makerNftTokenId2, uint256 takerNftTokenId2) = predictionMarket.mint(request2);
        
        // Verify both predictions exist (maker has 3 total including the initial setup prediction)
        assertEq(predictionMarket.getOwnedPredictionsCount(maker), 3);
        assertEq(predictionMarket.getOwnedPredictionsCount(address(vault)), 2);
        
        // Verify NFT IDs are sequential (starting after initial prediction NFTs 1 and 2)
        assertEq(makerNftTokenId1, 3);
        assertEq(takerNftTokenId1, 4);
        assertEq(makerNftTokenId2, 5);
        assertEq(takerNftTokenId2, 6);
        
        // Verify collateral tracking (maker has 3 total: 1 initial + 2 in this test)
        assertEq(predictionMarket.getUserCollateralDeposits(maker), MAKER_COLLATERAL * 3);
        assertEq(predictionMarket.getUserCollateralDeposits(address(vault)), TAKER_COLLATERAL * 2);
    }

    // ============ Limit Order Tests with Vault ============

    function test_fillOrder_withVaultManager_succeeds() public {
        // Maker places a limit order
        vm.startPrank(maker);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        
        IPredictionStructs.OrderRequestData memory orderRequest = IPredictionStructs.OrderRequestData({
            encodedPredictedOutcomes: ENCODED_OUTCOMES,
            resolver: address(mockResolver),
            makerCollateral: MAKER_COLLATERAL,
            takerCollateral: TAKER_COLLATERAL,
            orderDeadline: block.timestamp + 1 hours,
            refCode: REF_CODE
        });
        
        uint256 orderId = predictionMarket.placeOrder(orderRequest);
        vm.stopPrank();
        
        // Mint tokens to vault manager and have them fill the order
        collateralToken.mint(vaultManager, 10000e18);
        
        vm.startPrank(vaultManager);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        predictionMarket.fillOrder(orderId, REF_CODE);
        vm.stopPrank();
        
        // Verify prediction was created with vault manager as taker
        IPredictionStructs.LimitOrderData memory order = predictionMarket.getUnfilledOrder(orderId);
        assertEq(order.orderId, 0); // Order is filled (zeroed)
        
        // Verify the prediction exists (maker has 2 total including initial prediction)
        assertEq(predictionMarket.getOwnedPredictionsCount(maker), 2);
        assertEq(predictionMarket.getOwnedPredictionsCount(vaultManager), 1);
    }

    // ============ Manager Change Tests ============

    function test_mint_withVaultAsTaker_afterManagerChange_oldManagerSignatureFails() public {
        IPredictionStructs.MintPredictionRequestData memory request = _createMintRequestWithVaultAsTaker();
        
        // Change vault manager
        address newManager = vm.addr(999);
        vm.prank(vaultOwner);
        vault.setManager(newManager);
        
        // Try to mint with old manager's signature - should fail
        vm.prank(maker);
        vm.expectRevert(PredictionMarket.InvalidTakerSignature.selector);
        predictionMarket.mint(request);
    }

    function test_mint_withVaultAsTaker_afterManagerChange_newManagerSignatureSucceeds() public {
        // Change vault manager
        uint256 newManagerKey = 999;
        address newManager = vm.addr(newManagerKey);
        vm.prank(vaultOwner);
        vault.setManager(newManager);
        
        // Get current nonce
        uint256 currentNonce = predictionMarket.nonces(maker);
        
        // Create new signature with new manager using vault's EIP-712 domain
        bytes32 messageHash = keccak256(
            abi.encode(
                ENCODED_OUTCOMES,
                TAKER_COLLATERAL,
                MAKER_COLLATERAL,
                address(mockResolver),
                maker,
                block.timestamp + 1 hours,
                currentNonce
            )
        );
        
        bytes32 approvalHash = vault.getApprovalHash(messageHash, newManager);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(newManagerKey, approvalHash);
        
        IPredictionStructs.MintPredictionRequestData memory request = IPredictionStructs.MintPredictionRequestData({
            encodedPredictedOutcomes: ENCODED_OUTCOMES,
            resolver: address(mockResolver),
            makerCollateral: MAKER_COLLATERAL,
            takerCollateral: TAKER_COLLATERAL,
            maker: maker,
            taker: address(vault),
            makerNonce: currentNonce,
            takerSignature: abi.encodePacked(r, s, v),
            takerDeadline: block.timestamp + 1 hours,
            refCode: REF_CODE
        });
        
        // Should succeed with new manager's signature
        vm.prank(maker);
        (uint256 makerNftTokenId, uint256 takerNftTokenId) = predictionMarket.mint(request);
        
        assertGt(makerNftTokenId, 0);
        assertGt(takerNftTokenId, 0);
    }

    // ============ PassiveLiquidityVault.isValidSignature View Tests ============

    function test_isValidSignature_validManagerSignature_returnsCorrectMagicValue() public {
        bytes32 testMessage = keccak256("test message");
        
        // Sign with manager's key using vault's EIP-712 domain
        bytes32 approvalHash = vault.getApprovalHash(testMessage, vaultManager);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(MANAGER_PRIVATE_KEY, approvalHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Call isValidSignature
        bytes4 result = vault.isValidSignature(testMessage, signature);
        
        // Should return ERC1271 magic value
        assertEq(uint32(result), uint32(0x1626ba7e)); // IERC1271.isValidSignature.selector
    }

    function test_isValidSignature_invalidSignature_returnsInvalidValue() public {
        bytes32 testMessage = keccak256("test message");
        
        // Sign with wrong key (not manager)
        bytes32 approvalHash = vault.getApprovalHash(testMessage, vaultManager);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(999, approvalHash); // Wrong key
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Call isValidSignature
        bytes4 result = vault.isValidSignature(testMessage, signature);
        
        // Should return invalid value
        assertEq(uint32(result), uint32(0xFFFFFFFF));
    }

    function test_isValidSignature_nonManagerSigner_returnsInvalidValue() public {
        bytes32 testMessage = keccak256("test message");
        
        // Create a random signer (not the manager)
        address randomSigner = vm.addr(12345);
        bytes32 approvalHash = vault.getApprovalHash(testMessage, randomSigner);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(12345, approvalHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Call isValidSignature - even though signature is valid for randomSigner,
        // it should fail because randomSigner is not the manager
        bytes4 result = vault.isValidSignature(testMessage, signature);
        
        // Should return invalid value
        assertEq(uint32(result), uint32(0xFFFFFFFF));
    }

    function test_isValidSignature_malformedSignature_reverts() public {
        bytes32 testMessage = keccak256("test message");
        
        // Create malformed signature (wrong length - 64 bytes instead of 65)
        bytes memory malformedSignature = abi.encodePacked(bytes32(0), bytes32(0));
        
        // Call isValidSignature - should revert with ECDSAInvalidSignatureLength
        vm.expectRevert(); // ECDSA library reverts on invalid signature length
        vault.isValidSignature(testMessage, malformedSignature);
    }

    function test_isValidSignature_afterManagerChange_oldManagerFails() public {
        bytes32 testMessage = keccak256("test message");
        
        // Sign with old manager
        bytes32 approvalHash = vault.getApprovalHash(testMessage, vaultManager);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(MANAGER_PRIVATE_KEY, approvalHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Verify it works with old manager
        bytes4 resultBefore = vault.isValidSignature(testMessage, signature);
        assertEq(uint32(resultBefore), uint32(0x1626ba7e));
        
        // Change manager
        address newManager = vm.addr(999);
        vm.prank(vaultOwner);
        vault.setManager(newManager);
        
        // Old manager's signature should now fail
        bytes4 resultAfter = vault.isValidSignature(testMessage, signature);
        assertEq(uint32(resultAfter), uint32(0xFFFFFFFF));
    }

    function test_isValidSignature_afterManagerChange_newManagerSucceeds() public {
        bytes32 testMessage = keccak256("test message");
        
        // Change manager
        uint256 newManagerKey = 999;
        address newManager = vm.addr(newManagerKey);
        vm.prank(vaultOwner);
        vault.setManager(newManager);
        
        // Sign with new manager
        bytes32 approvalHash = vault.getApprovalHash(testMessage, newManager);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(newManagerKey, approvalHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Should succeed with new manager
        bytes4 result = vault.isValidSignature(testMessage, signature);
        assertEq(uint32(result), uint32(0x1626ba7e));
    }

    function test_isValidSignature_emptySignature_reverts() public {
        bytes32 testMessage = keccak256("test message");
        bytes memory emptySignature = "";
        
        // Call isValidSignature with empty signature - should revert
        vm.expectRevert(); // ECDSA library reverts on empty signature
        vault.isValidSignature(testMessage, emptySignature);
    }

    function test_isValidSignature_differentMessage_sameSignature_returnsInvalidValue() public {
        bytes32 message1 = keccak256("message 1");
        bytes32 message2 = keccak256("message 2");
        
        // Sign message1 with manager
        bytes32 approvalHash1 = vault.getApprovalHash(message1, vaultManager);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(MANAGER_PRIVATE_KEY, approvalHash1);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Verify signature works for message1
        bytes4 result1 = vault.isValidSignature(message1, signature);
        assertEq(uint32(result1), uint32(0x1626ba7e));
        
        // Try to use same signature for message2 - should fail
        bytes4 result2 = vault.isValidSignature(message2, signature);
        assertEq(uint32(result2), uint32(0xFFFFFFFF));
    }

    // ============ Integration Test: Full Lifecycle ============

    function test_fullLifecycle_vaultAsTaker_vaultDeploysFunds() public {
        // 1. User deposits into vault
        vm.startPrank(user1);
        collateralToken.approve(address(vault), 5000e18);
        vault.requestDeposit(5000e18, 5000e18);
        vm.stopPrank();
        
        vm.prank(vaultManager);
        vault.processDeposit(user1);
        
        // 2. Vault (via manager) becomes taker in prediction
        IPredictionStructs.MintPredictionRequestData memory request = _createMintRequestWithVaultAsTaker();
        vm.prank(maker);
        (uint256 makerNftTokenId, uint256 takerNftTokenId) = predictionMarket.mint(request);
        
        // 3. Verify vault owns the taker NFT
        assertEq(predictionMarket.ownerOf(takerNftTokenId), address(vault));
        
        // 4. Market resolves in vault's favor
        mockResolver.setResolutionResult(true, IPredictionMarketResolver.Error.NO_ERROR, false);
        
        // 5. Vault burns NFT and receives winnings
        uint256 vaultBalanceBefore = collateralToken.balanceOf(address(vault));
        vm.prank(vaultManager); // Manager can act on behalf of vault
        predictionMarket.burn(takerNftTokenId, REF_CODE);
        
        // 6. Verify vault received winnings
        uint256 vaultBalanceAfter = collateralToken.balanceOf(address(vault));
        assertEq(vaultBalanceAfter, vaultBalanceBefore + TOTAL_COLLATERAL);
        
        // 7. User can now withdraw with profit
        uint256 availableAssets = vault.availableAssets();
        assertGt(availableAssets, 5000e18); // Should have profit from winning prediction
    }
}

