// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/predictionMarket/PredictionMarket.sol";
import "../../src/predictionMarket/interfaces/IPredictionStructs.sol";
import "../../src/predictionMarket/interfaces/IPredictionMarketResolver.sol";
import "../../src/vault/PassiveLiquidityVault.sol";
import "../../src/vault/interfaces/IPassiveLiquidityVault.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "./mocks/MockERC20.sol";
import "./mocks/MockResolver.sol";

/**
 * @title PredictionMarketTransferRestrictionsTest
 * @notice Test suite for NFT transfer restrictions in PredictionMarket contract
 * @dev Tests that NFTs cannot be transferred to PassiveLiquidityVault contracts
 */
contract PredictionMarketTransferRestrictionsTest is Test {
    PredictionMarket public predictionMarket;
    MockERC20 public collateralToken;
    MockResolver public mockResolver;
    PassiveLiquidityVault public vault;
    
    address public maker;
    address public taker;
    address public eoaUser;
    
    uint256 public constant MIN_COLLATERAL = 1000e18;
    uint256 public constant MAKER_COLLATERAL = 2000e18;
    uint256 public constant TAKER_COLLATERAL = 1500e18;
    
    bytes32 public constant REF_CODE = keccak256("test-ref-code");
    bytes public constant ENCODED_OUTCOMES = abi.encode("test-outcomes");
    
    uint256 public makerNftTokenId;
    uint256 public takerNftTokenId;

    // Mock contract that implements ERC165 but not IPassiveLiquidityVault
    MockGenericContract public genericContract;
    
    // Mock contract that implements IPassiveLiquidityVault interface
    MockPassiveLiquidityVault public mockVault;

    function setUp() public {
        // Deploy mock contracts
        collateralToken = new MockERC20("Test Token", "TEST", 18);
        mockResolver = new MockResolver();
        
        // Create test accounts
        maker = vm.addr(1);
        taker = vm.addr(2);
        eoaUser = vm.addr(3);
        
        // Deploy prediction market
        predictionMarket = new PredictionMarket(
            "Prediction Market",
            "PM",
            address(collateralToken),
            MIN_COLLATERAL
        );
        
        // Deploy PassiveLiquidityVault
        vault = new PassiveLiquidityVault(
            address(collateralToken),
            vm.addr(4), // manager
            "Test Vault",
            "TV"
        );
        
        // Deploy mock contracts
        genericContract = new MockGenericContract();
        mockVault = new MockPassiveLiquidityVault();
        
        // Mint tokens to test accounts
        collateralToken.mint(maker, 10000e18);
        collateralToken.mint(taker, 10000e18);
        collateralToken.mint(eoaUser, 10000e18);
        
        // Approve prediction market to spend tokens
        vm.prank(maker);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        vm.prank(taker);
        collateralToken.approve(address(predictionMarket), type(uint256).max);
        
        // Create a prediction to get NFTs for testing
        IPredictionStructs.MintPredictionRequestData memory request = _createValidMintRequest();
        vm.prank(maker);
        (makerNftTokenId, takerNftTokenId) = predictionMarket.mint(request);
    }

    function _createValidMintRequest() internal view returns (IPredictionStructs.MintPredictionRequestData memory) {
        // Create the message hash that will be signed
        bytes32 messageHash = keccak256(
            abi.encode(
                ENCODED_OUTCOMES,
                TAKER_COLLATERAL,
                MAKER_COLLATERAL,
                address(mockResolver),
                maker,
                block.timestamp + 1 hours,
                0 // makerNonce
            )
        );
        
        // Get the EIP-712 approval hash that needs to be signed
        bytes32 approvalHash = predictionMarket.getApprovalHash(messageHash, taker);
        
        // Sign the approval hash with the taker's private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(2, approvalHash); // Use key 2 for taker
        bytes memory takerSignature = abi.encodePacked(r, s, v);
        
        return IPredictionStructs.MintPredictionRequestData({
            encodedPredictedOutcomes: ENCODED_OUTCOMES,
            resolver: address(mockResolver),
            makerCollateral: MAKER_COLLATERAL,
            takerCollateral: TAKER_COLLATERAL,
            maker: maker,
            taker: taker,
            makerNonce: 0,
            takerSignature: takerSignature,
            takerDeadline: block.timestamp + 1 hours,
            refCode: REF_CODE
        });
    }

    // ============ Successful Transfer Tests ============

    function test_transferMakerNft_toEOA_succeeds() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(makerNftTokenId), maker);
        
        // Transfer to EOA
        vm.prank(maker);
        predictionMarket.transferFrom(maker, eoaUser, makerNftTokenId);
        
        // Verify transfer succeeded
        assertEq(predictionMarket.ownerOf(makerNftTokenId), eoaUser);
        
        // Verify prediction maker was updated
        IPredictionStructs.PredictionData memory prediction = predictionMarket.getPrediction(makerNftTokenId);
        assertEq(prediction.maker, eoaUser);
    }

    function test_transferTakerNft_toEOA_succeeds() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(takerNftTokenId), taker);
        
        // Transfer to EOA
        vm.prank(taker);
        predictionMarket.transferFrom(taker, eoaUser, takerNftTokenId);
        
        // Verify transfer succeeded
        assertEq(predictionMarket.ownerOf(takerNftTokenId), eoaUser);
        
        // Verify prediction taker was updated
        IPredictionStructs.PredictionData memory prediction = predictionMarket.getPrediction(takerNftTokenId);
        assertEq(prediction.taker, eoaUser);
    }

    function test_transferMakerNft_toGenericContract_succeeds() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(makerNftTokenId), maker);
        
        // Transfer to generic contract
        vm.prank(maker);
        predictionMarket.transferFrom(maker, address(genericContract), makerNftTokenId);
        
        // Verify transfer succeeded
        assertEq(predictionMarket.ownerOf(makerNftTokenId), address(genericContract));
        
        // Verify prediction maker was updated
        IPredictionStructs.PredictionData memory prediction = predictionMarket.getPrediction(makerNftTokenId);
        assertEq(prediction.maker, address(genericContract));
    }

    function test_transferTakerNft_toGenericContract_succeeds() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(takerNftTokenId), taker);
        
        // Transfer to generic contract
        vm.prank(taker);
        predictionMarket.transferFrom(taker, address(genericContract), takerNftTokenId);
        
        // Verify transfer succeeded
        assertEq(predictionMarket.ownerOf(takerNftTokenId), address(genericContract));
        
        // Verify prediction taker was updated
        IPredictionStructs.PredictionData memory prediction = predictionMarket.getPrediction(takerNftTokenId);
        assertEq(prediction.taker, address(genericContract));
    }

    function test_safeTransferMakerNft_toGenericContract_succeeds() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(makerNftTokenId), maker);
        
        // Safe transfer to generic contract
        vm.prank(maker);
        predictionMarket.safeTransferFrom(maker, address(genericContract), makerNftTokenId);
        
        // Verify transfer succeeded
        assertEq(predictionMarket.ownerOf(makerNftTokenId), address(genericContract));
    }

    // ============ Failed Transfer Tests (to PassiveLiquidityVault) ============

    function test_transferMakerNft_toPassiveLiquidityVault_reverts() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(makerNftTokenId), maker);
        
        // Attempt transfer to PassiveLiquidityVault should revert
        vm.prank(maker);
        vm.expectRevert(PredictionMarket.TransferNotAllowed.selector);
        predictionMarket.transferFrom(maker, address(vault), makerNftTokenId);
        
        // Verify ownership unchanged
        assertEq(predictionMarket.ownerOf(makerNftTokenId), maker);
    }

    function test_transferTakerNft_toPassiveLiquidityVault_reverts() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(takerNftTokenId), taker);
        
        // Attempt transfer to PassiveLiquidityVault should revert
        vm.prank(taker);
        vm.expectRevert(PredictionMarket.TransferNotAllowed.selector);
        predictionMarket.transferFrom(taker, address(vault), takerNftTokenId);
        
        // Verify ownership unchanged
        assertEq(predictionMarket.ownerOf(takerNftTokenId), taker);
    }

    function test_safeTransferMakerNft_toPassiveLiquidityVault_reverts() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(makerNftTokenId), maker);
        
        // Attempt safe transfer to PassiveLiquidityVault should revert
        vm.prank(maker);
        vm.expectRevert(PredictionMarket.TransferNotAllowed.selector);
        predictionMarket.safeTransferFrom(maker, address(vault), makerNftTokenId);
        
        // Verify ownership unchanged
        assertEq(predictionMarket.ownerOf(makerNftTokenId), maker);
    }

    function test_safeTransferTakerNft_toPassiveLiquidityVault_reverts() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(takerNftTokenId), taker);
        
        // Attempt safe transfer to PassiveLiquidityVault should revert
        vm.prank(taker);
        vm.expectRevert(PredictionMarket.TransferNotAllowed.selector);
        predictionMarket.safeTransferFrom(taker, address(vault), takerNftTokenId);
        
        // Verify ownership unchanged
        assertEq(predictionMarket.ownerOf(takerNftTokenId), taker);
    }

    function test_safeTransferMakerNft_withData_toPassiveLiquidityVault_reverts() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(makerNftTokenId), maker);
        
        // Attempt safe transfer with data to PassiveLiquidityVault should revert
        vm.prank(maker);
        vm.expectRevert(PredictionMarket.TransferNotAllowed.selector);
        predictionMarket.safeTransferFrom(maker, address(vault), makerNftTokenId, "0x");
        
        // Verify ownership unchanged
        assertEq(predictionMarket.ownerOf(makerNftTokenId), maker);
    }

    // ============ Mock Contract Tests ============

    function test_transferMakerNft_toMockVault_reverts() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(makerNftTokenId), maker);
        
        // Attempt transfer to mock vault (implements IPassiveLiquidityVault) should revert
        vm.prank(maker);
        vm.expectRevert(PredictionMarket.TransferNotAllowed.selector);
        predictionMarket.transferFrom(maker, address(mockVault), makerNftTokenId);
        
        // Verify ownership unchanged
        assertEq(predictionMarket.ownerOf(makerNftTokenId), maker);
    }

    function test_transferTakerNft_toMockVault_reverts() public {
        // Verify initial ownership
        assertEq(predictionMarket.ownerOf(takerNftTokenId), taker);
        
        // Attempt transfer to mock vault (implements IPassiveLiquidityVault) should revert
        vm.prank(taker);
        vm.expectRevert(PredictionMarket.TransferNotAllowed.selector);
        predictionMarket.transferFrom(taker, address(mockVault), takerNftTokenId);
        
        // Verify ownership unchanged
        assertEq(predictionMarket.ownerOf(takerNftTokenId), taker);
    }

    // ============ Interface Detection Tests ============

    function test_passiveLiquidityVault_implementsCorrectInterface() public {
        // Verify that the vault implements IPassiveLiquidityVault interface
        assertTrue(vault.supportsInterface(type(IPassiveLiquidityVault).interfaceId));
    }

    function test_mockVault_implementsCorrectInterface() public {
        // Verify that the mock vault implements IPassiveLiquidityVault interface
        assertTrue(mockVault.supportsInterface(type(IPassiveLiquidityVault).interfaceId));
    }

    function test_genericContract_doesNotImplementVaultInterface() public {
        // Verify that the generic contract does not implement IPassiveLiquidityVault interface
        assertFalse(genericContract.supportsInterface(type(IPassiveLiquidityVault).interfaceId));
    }

    // ============ Edge Case Tests ============

    function test_transferToZeroAddress_revertsWithStandardERC721Error() public {
        // Transfer to zero address should revert with standard ERC721 error, not our custom error
        vm.prank(maker);
        vm.expectRevert(); // ERC721InvalidReceiver error
        predictionMarket.transferFrom(maker, address(0), makerNftTokenId);
    }

    function test_transferFromZeroAddress_revertsWithStandardERC721Error() public {
        // Transfer from zero address should revert with standard ERC721 error, not our custom error
        vm.prank(maker);
        vm.expectRevert(); // ERC721InvalidSender error
        predictionMarket.transferFrom(address(0), maker, makerNftTokenId);
    }

    function test_transferNonExistentToken_revertsWithStandardERC721Error() public {
        // Transfer non-existent token should revert with standard ERC721 error
        uint256 nonExistentTokenId = 999999;
        vm.prank(maker);
        vm.expectRevert(); // ERC721NonexistentToken error
        predictionMarket.transferFrom(maker, eoaUser, nonExistentTokenId);
    }

    function test_transferWithoutApproval_revertsWithStandardERC721Error() public {
        // Transfer without approval should revert with standard ERC721 error
        vm.prank(eoaUser); // Not the owner
        vm.expectRevert(); // ERC721InsufficientApproval error
        predictionMarket.transferFrom(maker, eoaUser, makerNftTokenId);
    }
}

/**
 * @title MockGenericContract
 * @notice Mock contract that implements ERC165 but not IPassiveLiquidityVault
 */
contract MockGenericContract is ERC165, IERC721Receiver {
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return 
            interfaceId == type(IERC721Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }
    
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

/**
 * @title MockPassiveLiquidityVault
 * @notice Mock contract that implements IPassiveLiquidityVault interface
 */
contract MockPassiveLiquidityVault is ERC165, IPassiveLiquidityVault {
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return 
            interfaceId == type(IPassiveLiquidityVault).interfaceId ||
            super.supportsInterface(interfaceId);
    }
    
    // Minimal implementation of IPassiveLiquidityVault interface functions
    function manager() external pure returns (address) { return address(0); }
    function expirationTime() external pure returns (uint256) { return 0; }
    function interactionDelay() external pure returns (uint256) { return 0; }
    function utilizationRate() external pure returns (uint256) { return 0; }
    function availableAssets() external pure returns (uint256) { return 0; }
    function totalDeployed() external pure returns (uint256) { return 0; }
    function emergencyMode() external pure returns (bool) { return false; }
    
    function requestDeposit(uint256 assets, uint256 expectedShares) external pure {}
    function requestWithdrawal(uint256 shares, uint256 expectedAssets) external pure {}
    function cancelWithdrawal() external pure {}
    function cancelDeposit() external pure {}
    function emergencyWithdraw(uint256 shares) external pure {}
    function processDeposit(address requestedBy) external pure {}
    function processWithdrawal(address requestedBy) external pure {}
    function batchProcessDeposit(address[] calldata) external pure {}
    function batchProcessWithdrawal(address[] calldata) external pure {}
    function approveFundsUsage(address protocol, uint256 amount) external pure {}
    function cleanInactiveProtocols() external pure {}
    function getActiveProtocolsCount() external pure returns (uint256) { return 0; }
    function getActiveProtocols() external pure returns (address[] memory) { return new address[](0); }
    function getActiveProtocol(uint256) external pure returns (address) { return address(0); }
    function getLockedShares(address) external view returns (uint256) { return 0; }
    function getAvailableShares(address) external view returns (uint256) { return 0; }
    function setManager(address) external pure {}
    function setMaxUtilizationRate(uint256) external pure {}
    function setExpirationTime(uint256) external pure {}
    function setInteractionDelay(uint256) external pure {}
    function toggleEmergencyMode() external pure {}
    function pause() external pure {}
    function unpause() external pure {}
    
    // IERC1271 function
    function isValidSignature(bytes32, bytes memory) external pure returns (bytes4) { return 0xFFFFFFFF; }
}
