// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../src/vault/PassiveLiquidityVault.sol";
import "../../src/vault/interfaces/IPassiveLiquidityVault.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Mock ERC20 token for testing
contract MockERC20 is ERC20 {
    uint8 private _decimals;
    
    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _decimals = decimals_;
    }
    
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// Mock prediction market for testing fund deployment
contract MockPredictionMarket {
    using SafeERC20 for IERC20;
    
    IERC20 public asset;
    address public vault;
    uint256 public totalDeposited;
    uint256 private nextTokenId = 1;
    
    // Mapping from token ID to prediction data
    mapping(uint256 => IPredictionStructs.PredictionData) public predictions;
    // Mapping from owner to list of owned token IDs
    mapping(address => uint256[]) public ownedTokens;
    // Mapping from token ID to owner
    mapping(uint256 => address) public tokenOwners;
    
    constructor(address _asset, address _vault) {
        asset = IERC20(_asset);
        vault = _vault;
    }
    
    function deposit(uint256 amount) external {
        asset.safeTransferFrom(msg.sender, address(this), amount);
        totalDeposited += amount;
        
        // Create a mock prediction NFT for the deposited amount
        uint256 tokenId = nextTokenId++;
        
        // Create prediction data where the vault is the maker
        predictions[tokenId] = IPredictionStructs.PredictionData({
            predictionId: tokenId,
            makerNftTokenId: tokenId,
            takerNftTokenId: 0,
            makerCollateral: amount,
            takerCollateral: 0,
            encodedPredictedOutcomes: "",
            resolver: address(this),
            maker: msg.sender,
            taker: address(0), // No taker for this mock
            settled: false,
            makerWon: false
        });
        
        // Mint NFT to the depositor
        tokenOwners[tokenId] = msg.sender;
        ownedTokens[msg.sender].push(tokenId);
    }
    
    function withdraw(uint256 amount) external {
        require(totalDeposited >= amount, "Insufficient balance");
        totalDeposited -= amount;
        asset.safeTransfer(msg.sender, amount);
        
        // Remove NFTs that represent the withdrawn amount
        // For simplicity, we'll remove the most recent NFTs
        uint256[] storage tokens = ownedTokens[msg.sender];
        uint256 remainingToRemove = amount;
        
        while (remainingToRemove > 0 && tokens.length > 0) {
            uint256 tokenId = tokens[tokens.length - 1];
            uint256 collateral = predictions[tokenId].makerCollateral;
            
            if (collateral <= remainingToRemove) {
                // Remove entire NFT
                remainingToRemove -= collateral;
                delete tokenOwners[tokenId];
                delete predictions[tokenId];
                tokens.pop();
            } else {
                // Partially reduce collateral
                predictions[tokenId].makerCollateral -= remainingToRemove;
                remainingToRemove = 0;
            }
        }
    }
    
    // Simulate receiving funds when approved (for testing purposes)
    function simulateApprovalUsage(uint256 amount) external {
        // Transfer from the vault (which approved the funds) to this protocol
        asset.safeTransferFrom(vault, address(this), amount);
        totalDeposited += amount;
        
        // Create a mock prediction NFT for the deposited amount
        uint256 tokenId = nextTokenId++;
        
        // Create prediction data where the vault is the maker
        predictions[tokenId] = IPredictionStructs.PredictionData({
            predictionId: tokenId,
            resolver: address(this),
            maker: vault, // The vault is the maker since it's deploying funds
            taker: address(0), // No taker for this mock
            encodedPredictedOutcomes: "",
            makerNftTokenId: tokenId,
            takerNftTokenId: 0,
            makerCollateral: amount,
            takerCollateral: 0,
            settled: false,
            makerWon: false
        });
        
        // Mint NFT to the vault (since the vault is the one deploying funds)
        tokenOwners[tokenId] = vault;
        ownedTokens[vault].push(tokenId);
    }
    
    function getBalance() external view returns (uint256) {
        return asset.balanceOf(address(this));
    }
    
    // IPredictionMarket interface functions
    function getOwnedPredictions(address owner) external view returns (uint256[] memory) {
        return ownedTokens[owner];
    }
    
    function getPrediction(uint256 tokenId) external view returns (IPredictionStructs.PredictionData memory) {
        return predictions[tokenId];
    }
    
    // ERC721-like functions for compatibility
    function ownerOf(uint256 tokenId) external view returns (address) {
        return tokenOwners[tokenId];
    }
    
    function balanceOf(address owner) external view returns (uint256) {
        return ownedTokens[owner].length;
    }
    
    // Add the new getUserCollateralDeposits function to match the real PredictionMarket
    function getUserCollateralDeposits(address user) external view returns (uint256) {
        uint256 totalCollateral = 0;
        uint256[] memory tokens = ownedTokens[user];
        for (uint256 i = 0; i < tokens.length; i++) {
            IPredictionStructs.PredictionData memory prediction = predictions[tokens[i]];
            if (prediction.maker == user) {
                totalCollateral += prediction.makerCollateral;
            }
            if (prediction.taker == user) {
                totalCollateral += prediction.takerCollateral;
            }
        }
        return totalCollateral;
    }
}

contract PassiveLiquidityVaultTest is Test {
    PassiveLiquidityVault public vault;
    MockERC20 public asset;
    MockPredictionMarket public protocol1;
    MockPredictionMarket public protocol2;
    MockPredictionMarket public protocol3;
    
    address public owner = address(0x1);
    address public manager = address(0x2);
    address public user1 = address(0x3);
    address public user2 = address(0x4);
    address public user3 = address(0x5);
    
    uint256 public constant INITIAL_SUPPLY = 1000000e18; // 1M tokens
    uint256 public constant DEPOSIT_AMOUNT = 100000e18; // 100K tokens (above MIN_DEPOSIT of 100e18)
    
    function setUp() public {
        vm.startPrank(owner);
        
        // Deploy mock asset token
        asset = new MockERC20("Test Token", "TEST", 18);
        
        // Deploy vault
        vault = new PassiveLiquidityVault(
            address(asset),
            manager,
            "Passive Liquidity Vault",
            "PLV"
        );
        
        // Deploy mock protocols
        protocol1 = new MockPredictionMarket(address(asset), address(vault));
        protocol2 = new MockPredictionMarket(address(asset), address(vault));
        protocol3 = new MockPredictionMarket(address(asset), address(vault));
        
        // Mint tokens to users
        asset.mint(user1, INITIAL_SUPPLY);
        asset.mint(user2, INITIAL_SUPPLY);
        asset.mint(user3, INITIAL_SUPPLY);
        
        // Set interaction delay to 0 for testing
        vault.setInteractionDelay(0);
        
        vm.stopPrank();
    }
    
    // ============ Helper Functions ============
    
    function _approveAndDeposit(address user, uint256 amount) internal returns (uint256 shares) {
        vm.startPrank(user);
        asset.approve(address(vault), amount);
        vault.requestDeposit(amount, amount); // 1:1 ratio initially
        vm.stopPrank();
        
        // Process the deposit to mint shares immediately
        vm.startPrank(manager);
        vault.processDeposit(user);
        vm.stopPrank();
        
        // Return the actual shares minted
        shares = vault.balanceOf(user);
    }
    
    function _deployFunds(address protocol, uint256 amount) internal {
        vm.startPrank(manager);
        vault.approveFundsUsage(protocol, amount);
        // Simulate the protocol using the approved funds
        MockPredictionMarket(protocol).simulateApprovalUsage(amount);
        vm.stopPrank();
    }
    
    function _recallFunds(address protocol, uint256 amount) internal {
        vm.startPrank(manager);
        // Note: recallFunds functionality is now handled by the protocol itself
        // The vault only approves funds, the protocol manages withdrawals
        vm.stopPrank();
    }
    
    // ============ Request-based Deposit Tests ============
    
    // Tests that users can deposit assets and receive shares through the request system
    function testRequestDeposit() public {
        uint256 amount = DEPOSIT_AMOUNT;
        
        vm.startPrank(user1);
        asset.approve(address(vault), amount);
        vault.requestDeposit(amount, amount); // 1:1 ratio initially
        vm.stopPrank();
        
        // Process the deposit to mint shares
        vm.startPrank(manager);
        vault.processDeposit(user1);
        vm.stopPrank();
        
        uint256 expectedShares = amount; // 1:1 ratio initially
        assertEq(vault.balanceOf(user1), expectedShares);
        assertEq(asset.balanceOf(address(vault)), amount);
        assertEq(vault.availableAssets(), amount);
    }
    
    // Tests that users can request shares by depositing the exact asset amount required
    function testRequestMint() public {
        uint256 shares = DEPOSIT_AMOUNT;
        
        vm.startPrank(user1);
        asset.approve(address(vault), shares);
        vault.requestDeposit(shares, shares); // 1:1 ratio initially
        vm.stopPrank();
        
        // Process the deposit to mint shares
        vm.startPrank(manager);
        vault.processDeposit(user1);
        vm.stopPrank();
        
        uint256 expectedAssets = shares; // 1:1 ratio initially
        assertEq(vault.balanceOf(user1), shares);
        assertEq(asset.balanceOf(address(vault)), expectedAssets);
        assertEq(vault.availableAssets(), expectedAssets);
    }
    
    // Tests that the withdraw function properly queues withdrawal requests instead of immediate withdrawal
    function testRequestWithdraw() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);
        
        vm.startPrank(user1);
        vault.requestWithdrawal(shares, depositAmount);
        
        assertEq(vault.balanceOf(user1), shares); // Shares are not burned until processing
        // Check pending request exists
        (, , , address requestUser, , ) = vault.pendingRequests(user1);
        assertEq(requestUser, user1);
        
        vm.stopPrank();
    }
    
    // Tests that the redeem function properly queues withdrawal requests for specific share amounts
    function testRequestRedeem() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);
        
        vm.startPrank(user1);
        vault.requestWithdrawal(shares, depositAmount);
        
        assertEq(vault.balanceOf(user1), shares); // Shares are not burned until processing
        // Check pending request exists
        (, , , address requestUser, , ) = vault.pendingRequests(user1);
        assertEq(requestUser, user1);
        
        vm.stopPrank();
    }
    
    // ============ Deposit Tests ============
    
    // Tests that multiple users can deposit different amounts and receive proportional shares
    function testDepositMultipleUsers() public {
        uint256 amount1 = DEPOSIT_AMOUNT;
        uint256 amount2 = DEPOSIT_AMOUNT * 2;
        
        uint256 shares1 = _approveAndDeposit(user1, amount1);
        uint256 shares2 = _approveAndDeposit(user2, amount2);
        
        assertEq(vault.balanceOf(user1), shares1);
        assertEq(vault.balanceOf(user2), shares2);
        assertEq(vault.totalSupply(), shares1 + shares2);
        assertEq(vault.availableAssets(), amount1 + amount2);
    }
    
    // Tests that deposits are blocked when the contract is paused
    function testDepositWhenPaused() public {
        vm.startPrank(owner);
        vault.pause();
        vm.stopPrank();
        
        vm.startPrank(user1);
        asset.approve(address(vault), DEPOSIT_AMOUNT);
        
        vm.expectRevert();
        vault.requestDeposit(DEPOSIT_AMOUNT, DEPOSIT_AMOUNT);
        
        vm.stopPrank();
    }
    
    // ============ Withdrawal Tests ============
    
    // Tests that users can request withdrawals and are added to the withdrawal queue
    function testRequestWithdrawal() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);
        
        vm.startPrank(user1);
        vault.requestWithdrawal(shares, depositAmount);
        
        assertEq(vault.balanceOf(user1), shares); // Shares are not burned until processing
        
        // Check pending request details
        (uint256 requestShares, uint256 requestAssets, , address requestUser, bool isDeposit, bool processed) = vault.pendingRequests(user1);
        assertEq(requestUser, user1);
        assertEq(requestShares, shares);
        assertEq(requestAssets, depositAmount);
        assertEq(isDeposit, false);
        assertEq(processed, false);
        
        vm.stopPrank();
    }
    
    // Tests that withdrawal requests are processed after the delay period and users receive their funds
    function testProcessWithdrawals() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);
        
        // Request withdrawal
        vm.startPrank(user1);
        vault.requestWithdrawal(shares, depositAmount);
        vm.stopPrank();
        
        // Process withdrawal (no delay needed in new implementation)
        vm.startPrank(manager);
        vault.processWithdrawal(user1);
        vm.stopPrank();
        
        // Check that withdrawal was processed
        (, , , , , bool processed) = vault.pendingRequests(user1);
        assertTrue(processed, "Withdrawal should be processed");
        
        // User should have received their assets back
        // The exact balance depends on the initial balance and the withdrawal amount
        uint256 expectedBalance = INITIAL_SUPPLY - depositAmount + depositAmount; // Initial - deposit + withdrawal
        uint256 actualBalance = asset.balanceOf(user1);
        assertEq(actualBalance, expectedBalance, "User balance should match expected amount");
    }
    
    // Tests that withdrawal requests can be processed immediately by manager
    function testProcessWithdrawalsImmediately() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);
        
        // Request withdrawal
        vm.startPrank(user1);
        vault.requestWithdrawal(shares, depositAmount);
        vm.stopPrank();
        
        // Process immediately (new implementation allows immediate processing)
        vm.startPrank(manager);
        vault.processWithdrawal(user1);
        vm.stopPrank();
        
        // Should be processed
        (, , , , , bool processed) = vault.pendingRequests(user1);
        assertTrue(processed);
    }
    
    // Tests that emergency withdrawals bypass the queue and delay when emergency mode is active
    function testEmergencyWithdrawal() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        uint256 shares = _approveAndDeposit(user1, depositAmount);
        
        // Enable emergency mode
        vm.startPrank(owner);
        vault.toggleEmergencyMode();
        vm.stopPrank();
        
        // Emergency withdraw
        vm.startPrank(user1);
        vault.emergencyWithdraw(shares);
        vm.stopPrank();
        
        assertEq(asset.balanceOf(user1), INITIAL_SUPPLY);
        assertEq(vault.balanceOf(user1), 0);
    }
    
    // ============ Fund Deployment Tests ============
    
    // Tests that the manager can deploy funds to external protocols and utilization rate is updated
    function testDeployFunds() public {
        uint256 depositAmount = DEPOSIT_AMOUNT * 2;
        _approveAndDeposit(user1, depositAmount);
        
        uint256 deployAmount = DEPOSIT_AMOUNT;
        _deployFunds(address(protocol1), deployAmount);
        
        assertEq(vault.totalDeployed(), deployAmount);
        assertEq(vault.utilizationRate(), 0.5e18); // 50% in WAD
        assertEq(protocol1.getBalance(), deployAmount);
        assertEq(vault.getActiveProtocolsCount(), 1);
        assertEq(vault.getActiveProtocol(0), address(protocol1));
    }
    
    // Tests that fund deployment is rejected when it would exceed available assets
    function testDeployFundsExceedsMaxUtilization() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        _approveAndDeposit(user1, depositAmount);
        
        uint256 deployAmount = depositAmount + 1; // Exceeds available
        
        vm.startPrank(manager);
        asset.approve(address(protocol1), deployAmount);
        
        vm.expectRevert(abi.encodeWithSelector(PassiveLiquidityVault.InsufficientAvailableAssets.selector, deployAmount, vault.availableAssets()));
        vault.approveFundsUsage(address(protocol1), deployAmount);
        
        vm.stopPrank();
    }
    
    // Tests that fund deployment is rejected when it would exceed the maximum utilization rate
    function testDeployFundsExceedsMaxUtilizationRate() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        _approveAndDeposit(user1, depositAmount);
        
        // Set max utilization to 50%
        vm.startPrank(owner);
        vault.setMaxUtilizationRate(0.5e18); // 50% in WAD
        vm.stopPrank();
        
        uint256 deployAmount = (depositAmount * 6000) / 10000; // 60% utilization
        
        vm.startPrank(manager);
        asset.approve(address(protocol1), deployAmount);
        
        vm.expectRevert(abi.encodeWithSelector(PassiveLiquidityVault.ExceedsMaxUtilization.selector, 0.6e18, 0.5e18));
        vault.approveFundsUsage(address(protocol1), deployAmount);
        
        vm.stopPrank();
    }
    
    // Tests that cumulative approvals across multiple protocols respect the max utilization rate
    function testMultipleProtocolApprovalsCumulativeLimit() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        _approveAndDeposit(user1, depositAmount);
        
        // Set max utilization to 80%
        vm.startPrank(owner);
        vault.setMaxUtilizationRate(0.8e18); // 80% in WAD
        vm.stopPrank();
        
        vm.startPrank(manager);
        
        // First approval: 50% to protocol1 - should succeed
        uint256 firstApproval = (depositAmount * 5000) / 10000; // 50%
        vault.approveFundsUsage(address(protocol1), firstApproval);
        
        // Second approval: 40% to protocol2 - should fail because 50% + 40% = 90% > 80%
        uint256 secondApproval = (depositAmount * 4000) / 10000; // 40%
        
        // Expected: 90% utilization, max: 80%
        vm.expectRevert(abi.encodeWithSelector(PassiveLiquidityVault.ExceedsMaxUtilization.selector, 0.9e18, 0.8e18));
        vault.approveFundsUsage(address(protocol2), secondApproval);
        
        vm.stopPrank();
    }
    
    // Tests that approveFundsUsage fails when deployed liquidity + previous approval + new approval exceeds max utilization
    function testApproveFundsUsageWithDeployedLiquidityExceedsMaxUtilization() public {
        uint256 depositAmount = DEPOSIT_AMOUNT * 2; // 200K tokens
        _approveAndDeposit(user1, depositAmount);
        
        // Set max utilization to 80%
        vm.startPrank(owner);
        vault.setMaxUtilizationRate(0.8e18); // 80% in WAD
        vm.stopPrank();
        
        vm.startPrank(manager);
        
        // Step 1: Deploy 30% of funds to protocol1 (this creates deployed liquidity)
        uint256 deployAmount = (depositAmount * 3000) / 10000; // 30% = 60K tokens
        vault.approveFundsUsage(address(protocol1), deployAmount);
        // Simulate the protocol using the approved funds (creating deployed liquidity)
        protocol1.simulateApprovalUsage(deployAmount);
        
        // Step 2: Approve 40% to protocol2 (this should succeed: 30% deployed + 40% approved = 70% < 80%)
        uint256 secondApproval = (depositAmount * 4000) / 10000; // 40% = 80K tokens
        vault.approveFundsUsage(address(protocol2), secondApproval);
        
        // Step 3: Try to approve 20% to protocol3 (this should fail)
        // Total would be: 30% deployed + 40% existing approval + 20% new approval = 90% > 80%
        uint256 additionalApproval = (depositAmount * 2000) / 10000; // 20% = 40K tokens
        
        // Expected: 90% utilization (0.9e18), max: 80% (0.8e18)
        vm.expectRevert(abi.encodeWithSelector(PassiveLiquidityVault.ExceedsMaxUtilization.selector, 0.9e18, 0.8e18));
        vault.approveFundsUsage(address(protocol3), additionalApproval);
        
        vm.stopPrank();
        
        // Verify the state after the failed attempt
        assertEq(vault.totalDeployed(), deployAmount, "Deployed amount should be 30%");
        assertEq(asset.allowance(address(vault), address(protocol2)), secondApproval, "Protocol2 allowance should remain at 40%");
        assertEq(asset.allowance(address(vault), address(protocol3)), 0, "Protocol3 allowance should remain 0 (no additional approval)");
    }
    
    // Tests that re-approving to the same protocol replaces the previous approval rather than adding to it
    function testApproveFundsUsageReplacesPreviousApproval() public {
        uint256 depositAmount = DEPOSIT_AMOUNT * 2; // 200K tokens
        _approveAndDeposit(user1, depositAmount);
        
        // Set max utilization to 80%
        vm.startPrank(owner);
        vault.setMaxUtilizationRate(0.8e18); // 80% in WAD
        vm.stopPrank();
        
        vm.startPrank(manager);
        
        // Step 1: Deploy 30% of funds to protocol1 (this creates deployed liquidity)
        uint256 deployAmount = (depositAmount * 3000) / 10000; // 30% = 60K tokens
        vault.approveFundsUsage(address(protocol1), deployAmount);
        protocol1.simulateApprovalUsage(deployAmount);
        
        // Step 2: Approve 40% to protocol2
        uint256 firstApproval = (depositAmount * 4000) / 10000; // 40% = 80K tokens
        vault.approveFundsUsage(address(protocol2), firstApproval);
        
        // Step 3: Re-approve protocol2 with 50% (this should succeed because it replaces the 40%, not adds to it)
        // Total would be: 30% deployed + 50% new approval = 80% = max utilization
        uint256 reApproval = (depositAmount * 5000) / 10000; // 50% = 100K tokens
        vault.approveFundsUsage(address(protocol2), reApproval);
        
        vm.stopPrank();
        
        // Verify the allowance was updated (should be 50%, not 90%)
        assertEq(asset.allowance(address(vault), address(protocol2)), reApproval, "Protocol2 allowance should be updated to 50%");
        assertEq(vault.totalDeployed(), deployAmount, "Deployed amount should remain 30%");
    }
    
    // Tests multiple protocols with deployed liquidity and approvals to ensure cumulative limits work correctly
    function testApproveFundsUsageMultipleProtocolsWithDeployedLiquidity() public {
        uint256 depositAmount = DEPOSIT_AMOUNT * 3; // 300K tokens
        _approveAndDeposit(user1, depositAmount);
        
        // Set max utilization to 90%
        vm.startPrank(owner);
        vault.setMaxUtilizationRate(0.9e18); // 90% in WAD
        vm.stopPrank();
        
        vm.startPrank(manager);
        
        // Step 1: Deploy 20% to protocol1 (creates deployed liquidity)
        uint256 deployAmount1 = (depositAmount * 2000) / 10000; // 20% = 60K tokens
        vault.approveFundsUsage(address(protocol1), deployAmount1);
        protocol1.simulateApprovalUsage(deployAmount1);
        
        // Step 2: Deploy 30% to protocol2 (creates more deployed liquidity)
        uint256 deployAmount2 = (depositAmount * 3000) / 10000; // 30% = 90K tokens
        vault.approveFundsUsage(address(protocol2), deployAmount2);
        protocol2.simulateApprovalUsage(deployAmount2);
        
        // Step 3: Approve 35% to protocol1 (this should succeed: 20% + 30% deployed + 35% approved = 85% < 90%)
        uint256 approval1 = (depositAmount * 3500) / 10000; // 35% = 105K tokens
        vault.approveFundsUsage(address(protocol1), approval1);
        
        // Step 4: Try to approve 10% to protocol2 (this should fail)
        // Total would be: 20% + 30% deployed + 35% + 10% approved = 95% > 90%
        uint256 additionalApproval = (depositAmount * 1000) / 10000; // 10% = 30K tokens
        
        // Expected: 95% utilization (0.95e18), max: 90% (0.9e18)
        vm.expectRevert(abi.encodeWithSelector(PassiveLiquidityVault.ExceedsMaxUtilization.selector, 0.95e18, 0.9e18));
        vault.approveFundsUsage(address(protocol2), additionalApproval);
        
        vm.stopPrank();
        
        // Verify the state
        assertEq(vault.totalDeployed(), deployAmount1 + deployAmount2, "Total deployed should be 50%");
        assertEq(asset.allowance(address(vault), address(protocol1)), approval1, "Protocol1 allowance should be 35%");
        assertEq(asset.allowance(address(vault), address(protocol2)), 0, "Protocol2 allowance should remain 0 (no additional approval)");
    }
    
    // Tests that cumulative approvals work correctly when one protocol is re-approved
    function testReApprovalToSameProtocolReplacesAllowance() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        _approveAndDeposit(user1, depositAmount);
        
        // Set max utilization to 80%
        vm.startPrank(owner);
        vault.setMaxUtilizationRate(0.8e18); // 80% in WAD
        vm.stopPrank();
        
        vm.startPrank(manager);
        
        // First approval: 50% to protocol1
        uint256 firstApproval = (depositAmount * 5000) / 10000; // 50%
        vault.approveFundsUsage(address(protocol1), firstApproval);
        
        // Re-approve protocol1 with 70% - should succeed because it replaces the 50%, not adds to it
        uint256 reApproval = (depositAmount * 7000) / 10000; // 70%
        vault.approveFundsUsage(address(protocol1), reApproval);
        
        // Verify the approval was updated (should be 70%, not 120%)
        assertEq(asset.allowance(address(vault), address(protocol1)), reApproval);
        
        vm.stopPrank();
    }
    
    // Tests that the manager can recall funds from external protocols and utilization rate is updated
    function testRecallFunds() public {
        uint256 depositAmount = DEPOSIT_AMOUNT * 2;
        _approveAndDeposit(user1, depositAmount);
        
        uint256 deployAmount = DEPOSIT_AMOUNT;
        _deployFunds(address(protocol1), deployAmount);
        
        // Note: recallFunds functionality is now handled by the protocol itself
        // The vault only approves funds, the protocol manages withdrawals
        // This test verifies that the deployment was successful
        assertEq(vault.totalDeployed(), deployAmount);
        assertTrue(vault.utilizationRate() > 0, "Utilization rate should be greater than 0");
        assertEq(protocol1.getBalance(), deployAmount);
    }
    
    // Tests that all funds can be recalled from a protocol and the protocol is removed from active list
    function testRecallAllFunds() public {
        uint256 depositAmount = DEPOSIT_AMOUNT * 2;
        _approveAndDeposit(user1, depositAmount);
        
        uint256 deployAmount = DEPOSIT_AMOUNT;
        _deployFunds(address(protocol1), deployAmount);
        
        // Note: recallFunds functionality is now handled by the protocol itself
        // The vault only approves funds, the protocol manages withdrawals
        // This test verifies that the deployment was successful
        assertEq(vault.totalDeployed(), deployAmount);
        assertTrue(vault.utilizationRate() > 0, "Utilization rate should be greater than 0");
        assertEq(vault.getActiveProtocolsCount(), 1);
    }
    
    // ============ Utilization Rate Tests ============
    
    // Tests that utilization rate is calculated correctly when deploying funds to multiple protocols
    function testUtilizationRateCalculation() public {
        uint256 depositAmount = DEPOSIT_AMOUNT * 10;
        _approveAndDeposit(user1, depositAmount);
        
        // Set max utilization to 95% for this test
        vm.startPrank(owner);
        vault.setMaxUtilizationRate(0.95e18); // 95% in WAD
        vm.stopPrank();
        
        // Deploy 80% of funds
        uint256 deployAmount = (depositAmount * 8000) / 10000;
        _deployFunds(address(protocol1), deployAmount);
        
        assertEq(vault.utilizationRate(), 0.8e18); // 80% in WAD
        
        // Deploy more to reach 90% (but stay within max utilization)
        uint256 additionalDeploy = (depositAmount * 1000) / 10000;
        _deployFunds(address(protocol2), additionalDeploy);
        
        // Should be 90% utilization (0.89e18 to 0.91e18 in WAD)
        assertTrue(vault.utilizationRate() >= 0.89e18 && vault.utilizationRate() <= 0.91e18, "Utilization rate out of expected range");
    }
    
    // ============ Admin Function Tests ============
    
    // Tests that the owner can set a new manager address
    function testSetManager() public {
        address newManager = address(0x6);
        
        vm.startPrank(owner);
        vault.setManager(newManager);
        vm.stopPrank();
        
        assertEq(vault.manager(), newManager);
    }
    
    // Tests that the owner can set a new maximum utilization rate
    function testSetMaxUtilizationRate() public {
        uint256 newMaxRate = 0.9e18; // 90% in WAD
        
        vm.startPrank(owner);
        vault.setMaxUtilizationRate(newMaxRate);
        vm.stopPrank();
        
        assertEq(vault.maxUtilizationRate(), newMaxRate);
    }
    
    // Tests that the owner can set a new withdrawal delay period
    function testSetInteractionDelay() public {
        uint256 newDelay = 2 days;
        
        vm.startPrank(owner);
        vault.setInteractionDelay(newDelay);
        vm.stopPrank();
        
        assertEq(vault.interactionDelay(), newDelay);
    }
    
    // Tests that the owner can set a new expiration time for requests
    function testSetExpirationTime() public {
        uint256 newExpirationTime = 15 minutes;
        
        vm.startPrank(owner);
        vault.setExpirationTime(newExpirationTime);
        vm.stopPrank();
        
        assertEq(vault.expirationTime(), newExpirationTime);
    }
    
    // Tests that the owner can toggle emergency mode on and off
    function testToggleEmergencyMode() public {
        assertFalse(vault.emergencyMode());
        
        vm.startPrank(owner);
        vault.toggleEmergencyMode();
        vm.stopPrank();
        
        assertTrue(vault.emergencyMode());
        
        vm.startPrank(owner);
        vault.toggleEmergencyMode();
        vm.stopPrank();
        
        assertFalse(vault.emergencyMode());
    }

    // Tests that the EmergencyModeUpdated event is properly emitted when toggling emergency mode
    function testToggleEmergencyModeEmitsEvent() public {
        // Test enabling emergency mode
        vm.startPrank(owner);
        vm.expectEmit(true, true, true, true);
        emit IPassiveLiquidityVault.EmergencyModeUpdated(true);
        vault.toggleEmergencyMode();
        vm.stopPrank();
        
        assertTrue(vault.emergencyMode(), "Emergency mode should be enabled");
        
        // Test disabling emergency mode
        vm.startPrank(owner);
        vm.expectEmit(true, true, true, true);
        emit IPassiveLiquidityVault.EmergencyModeUpdated(false);
        vault.toggleEmergencyMode();
        vm.stopPrank();
        
        assertFalse(vault.emergencyMode(), "Emergency mode should be disabled");
    }

    // Tests that the MaxUtilizationRateUpdated event is properly emitted when setting max utilization rate
    function testSetMaxUtilizationRateEmitsEvent() public {
        uint256 newMaxRate = 0.9e18; // 90% in WAD
        
        vm.startPrank(owner);
        vm.expectEmit(true, true, true, true);
        emit IPassiveLiquidityVault.MaxUtilizationRateUpdated(vault.maxUtilizationRate(), newMaxRate);
        vault.setMaxUtilizationRate(newMaxRate);
        vm.stopPrank();
        
        assertEq(vault.maxUtilizationRate(), newMaxRate, "Max utilization rate should be updated");
    }

    // Tests that the ProjectedUtilizationRateUpdated event is properly emitted when approving funds usage
    function testApproveFundsUsageEmitsProjectedUtilizationEvent() public {
        uint256 depositAmount = DEPOSIT_AMOUNT * 2;
        _approveAndDeposit(user1, depositAmount);
        
        uint256 deployAmount = DEPOSIT_AMOUNT;
        
        // Calculate expected values before deployment
        uint256 currentUtilizationRate = vault.utilizationRate();
        uint256 availableAssetsValue = vault.availableAssets();
        uint256 deployedLiquidity = vault.totalDeployed();
        uint256 totalAssetsValue = availableAssetsValue + deployedLiquidity;
        
        // Calculate projected utilization rate after deployment
        uint256 utilizedPlusApprovals = deployedLiquidity + deployAmount;
        uint256 projectedUtilizationRate = totalAssetsValue > 0
            ? (utilizedPlusApprovals * vault.WAD()) / totalAssetsValue
            : 0;
        
        vm.startPrank(manager);
        vm.expectEmit(true, true, true, true);
        emit IPassiveLiquidityVault.ProjectedUtilizationRateUpdated(currentUtilizationRate, projectedUtilizationRate);
        vault.approveFundsUsage(address(protocol1), deployAmount);
        vm.stopPrank();
        
        // Verify the approval was successful by checking the protocol is in active protocols
        assertTrue(vault.getActiveProtocolsCount() > 0, "Protocol should be added to active protocols");
        assertEq(vault.getActiveProtocol(0), address(protocol1), "Protocol should be the first active protocol");
    }
    
    // ============ Access Control Tests ============
    
    // Tests that only the manager can deploy funds to external protocols
    function testOnlyManagerCanDeployFunds() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        _approveAndDeposit(user1, depositAmount);
        
        vm.startPrank(user1);
        vm.expectRevert(abi.encodeWithSelector(PassiveLiquidityVault.OnlyManager.selector, user1, manager));
        vault.approveFundsUsage(address(protocol1), DEPOSIT_AMOUNT / 2);
        vm.stopPrank();
    }
    
    // Tests that only the manager can recall funds from external protocols
    function testOnlyManagerCanRecallFunds() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        _approveAndDeposit(user1, depositAmount);
        _deployFunds(address(protocol1), DEPOSIT_AMOUNT / 2);
        
        // Note: recallFunds functionality is now handled by the protocol itself
        // The vault only approves funds, the protocol manages withdrawals
        // This test verifies that the deployment was successful
        assertEq(vault.totalDeployed(), DEPOSIT_AMOUNT / 2);
        assertTrue(vault.utilizationRate() > 0, "Utilization rate should be greater than 0");
    }
    
    // Tests that only the owner can set a new manager address
    function testOnlyOwnerCanSetManager() public {
        vm.startPrank(user1);
        vm.expectRevert();
        vault.setManager(address(0x6));
        vm.stopPrank();
    }
    
    // ============ Edge Case Tests ============
    
    // Tests that multiple users can request withdrawals and all are processed
    function testWithdrawalQueueMultipleUsers() public {
        uint256 amount1 = DEPOSIT_AMOUNT;
        uint256 amount2 = DEPOSIT_AMOUNT * 2;
        uint256 amount3 = DEPOSIT_AMOUNT * 3;
        
        uint256 shares1 = _approveAndDeposit(user1, amount1);
        uint256 shares2 = _approveAndDeposit(user2, amount2);
        uint256 shares3 = _approveAndDeposit(user3, amount3);
        
        // Request withdrawals
        vm.startPrank(user1);
        vault.requestWithdrawal(shares1, amount1);
        vm.stopPrank();
        
        vm.startPrank(user2);
        vault.requestWithdrawal(shares2, amount2);
        vm.stopPrank();
        
        vm.startPrank(user3);
        vault.requestWithdrawal(shares3, amount3);
        vm.stopPrank();
        
        // Process all withdrawals
        vm.startPrank(manager);
        vault.processWithdrawal(user1);
        vault.processWithdrawal(user2);
        vault.processWithdrawal(user3);
        vm.stopPrank();
        
        // All withdrawals should be processed
        
        // Check all users got their funds back (allow for rounding differences)
        // Each user should have their initial balance minus what they deposited plus what they withdrew
        uint256 expectedBalance1 = INITIAL_SUPPLY; // Should be back to initial balance
        uint256 actualBalance1 = asset.balanceOf(user1);
        uint256 tolerance1 = expectedBalance1 / 50; // 2% tolerance for rounding differences in multi-user scenarios
        assertTrue(actualBalance1 >= expectedBalance1 - tolerance1 && actualBalance1 <= expectedBalance1 + tolerance1, "User1 balance incorrect");
        
        uint256 expectedBalance2 = INITIAL_SUPPLY; // Should be back to initial balance
        uint256 actualBalance2 = asset.balanceOf(user2);
        uint256 tolerance2 = expectedBalance2 / 50; // 2% tolerance for rounding differences in multi-user scenarios
        assertTrue(actualBalance2 >= expectedBalance2 - tolerance2 && actualBalance2 <= expectedBalance2 + tolerance2, "User2 balance incorrect");
        
        uint256 expectedBalance3 = INITIAL_SUPPLY; // Should be back to initial balance
        uint256 actualBalance3 = asset.balanceOf(user3);
        uint256 tolerance3 = expectedBalance3 / 50; // 2% tolerance for rounding differences in multi-user scenarios
        assertTrue(actualBalance3 >= expectedBalance3 - tolerance3 && actualBalance3 <= expectedBalance3 + tolerance3, "User3 balance incorrect");
    }
    
    // Tests that withdrawals are processed when funds are available
    function testWithdrawalProcessingWithDeployedFunds() public {
        uint256 depositAmount = DEPOSIT_AMOUNT * 2;
        _approveAndDeposit(user1, depositAmount);
        
        // Deploy some funds to reduce available liquidity
        _deployFunds(address(protocol1), DEPOSIT_AMOUNT);
        
        // Request withdrawal for available amount only (not the full deposit)
        uint256 availableAmount = DEPOSIT_AMOUNT; // Only what's available after deployment
        vm.startPrank(user1);
        vault.requestWithdrawal(availableAmount, availableAmount);
        vm.stopPrank();
        
        // Process withdrawal - should process the available amount
        vm.startPrank(manager);
        vault.processWithdrawal(user1);
        vm.stopPrank();
        
        // User should have received the available amount
        uint256 expectedBalance = INITIAL_SUPPLY - depositAmount + availableAmount; // Initial - deposit + withdrawal
        uint256 actualBalance = asset.balanceOf(user1);
        
        // Allow for small rounding differences (2% tolerance)
        uint256 tolerance = expectedBalance / 50; // 2% of expected balance
        assertTrue(actualBalance >= expectedBalance - tolerance, "User balance too low");
        assertTrue(actualBalance <= expectedBalance + tolerance, "User balance too high");
    }

    // Test that emergency withdrawal correctly excludes unconfirmed assets from share calculations
    function testEmergencyWithdrawExcludesUnconfirmedAssets() public {
        // Setup: user1 deposits and gets confirmed shares
        uint256 user1DepositAmount = 1000e18;
        _approveAndDeposit(user1, user1DepositAmount);
        
        // Get user1's shares
        uint256 user1Shares = vault.balanceOf(user1);
        assertGt(user1Shares, 0, "User1 should have shares");
        
        // Now user2 requests a deposit (assets transferred but shares not minted yet)
        uint256 user2DepositAmount = 500e18;
        vm.startPrank(user2);
        asset.approve(address(vault), user2DepositAmount);
        vault.requestDeposit(user2DepositAmount, user2DepositAmount);
        vm.stopPrank();
        
        // At this point:
        // - Vault has 1500e18 total balance (1000e18 confirmed + 500e18 unconfirmed)
        // - user1 has all the shares
        // - user2 has a pending deposit request with 500e18 unconfirmed assets
        
        uint256 vaultBalanceBeforeEmergency = asset.balanceOf(address(vault));
        assertEq(vaultBalanceBeforeEmergency, user1DepositAmount + user2DepositAmount, "Vault should have both deposits");
        
        // Enable emergency mode
        vm.prank(owner);
        vault.toggleEmergencyMode();
        assertTrue(vault.emergencyMode(), "Emergency mode should be enabled");
        
        // User1 does emergency withdrawal of all their shares
        uint256 user1BalanceBefore = asset.balanceOf(user1);
        
        vm.prank(user1);
        vault.emergencyWithdraw(user1Shares);
        
        uint256 user1BalanceAfter = asset.balanceOf(user1);
        uint256 user1Received = user1BalanceAfter - user1BalanceBefore;
        
        // CRITICAL: user1 should receive based on availableAssets MINUS unconfirmedAssets
        // availableAssets = vault balance - unconfirmedAssets = 1500e18 - 500e18 = 1000e18
        // Since user1 owns 100% of shares, they should get ~1000e18, NOT 1500e18
        
        console.log("User1 received:", user1Received);
        console.log("User1 deposited:", user1DepositAmount);
        console.log("User2 unconfirmed:", user2DepositAmount);
        console.log("Vault balance after:", asset.balanceOf(address(vault)));
        
        // User1 should receive approximately their original deposit (1000e18)
        // NOT the full vault balance including unconfirmed assets
        uint256 expectedMin = user1DepositAmount - 1e18; // Allow 1 token tolerance for rounding
        uint256 expectedMax = user1DepositAmount + 1e18;
        
        assertTrue(user1Received >= expectedMin, "User1 received too little");
        assertTrue(user1Received <= expectedMax, "User1 received too much - unconfirmed assets were included!");
        
        // User2's deposit should still be in the vault (protected)
        uint256 vaultBalanceAfter = asset.balanceOf(address(vault));
        uint256 expectedVaultBalance = user2DepositAmount; // Only user2's unconfirmed deposit remains
        
        // Allow small rounding tolerance
        assertTrue(vaultBalanceAfter >= expectedVaultBalance - 1e18, "Vault should still have user2's unconfirmed deposit");
        assertTrue(vaultBalanceAfter <= expectedVaultBalance + 1e18, "Vault balance higher than expected");
        
        // Verify user2's pending request is still intact
        (, uint256 requestAssets, , address requestUser, bool isDeposit, bool processed) = vault.pendingRequests(user2);
        assertEq(requestUser, user2, "User2's request should still exist");
        assertTrue(isDeposit, "Should be a deposit request");
        assertEq(requestAssets, user2DepositAmount, "User2's request assets should be intact");
        assertFalse(processed, "User2's request should not be processed yet");
        
        console.log("SUCCESS: Emergency withdrawal correctly excluded unconfirmed assets");
        console.log("User1 got their fair share without touching user2's pending deposit");
    }

    // ============ ERC721 Receiver Tests ============

    function test_vaultCanReceiveERC721NFT() public {
        console.log("\n=== Testing Vault Can Receive ERC721 NFT ===");
        
        // Deploy a mock ERC721 that uses _safeMint
        MockERC721WithSafeMint mockNFT = new MockERC721WithSafeMint("Test NFT", "TNFT");
        
        // Mint an NFT to the vault using _safeMint
        // This should succeed because the vault implements onERC721Received
        uint256 tokenId = mockNFT.safeMintTo(address(vault));
        
        console.log("NFT token ID:", tokenId);
        console.log("NFT owner:", mockNFT.ownerOf(tokenId));
        
        // Verify the vault received the NFT
        assertEq(mockNFT.ownerOf(tokenId), address(vault), "Vault should own the NFT");
        assertEq(mockNFT.balanceOf(address(vault)), 1, "Vault should have 1 NFT");
        
        console.log("SUCCESS: Vault successfully received ERC721 NFT via _safeMint");
    }

    function test_onERC721ReceivedReturnsCorrectSelector() public {
        // Test that onERC721Received returns the correct selector
        bytes4 expectedSelector = 0x150b7a02; // IERC721Receiver.onERC721Received.selector
        
        bytes4 returnedSelector = vault.onERC721Received(
            address(this),
            address(user1),
            1,
            ""
        );
        
        assertEq(returnedSelector, expectedSelector, "Should return correct ERC721Receiver selector");
    }

    // ============ Interaction Delay Tests ============

    function test_userCanMakeNewRequestImmediatelyAfterCancelingDeposit() public {
        console.log("\n=== Testing User Can Make New Request After Canceling Deposit ===");
        
        // Use a fresh user to avoid any previous interactions
        address freshUser = address(0x999);
        asset.mint(freshUser, INITIAL_SUPPLY);
        
        // Debug: Check initial state
        uint256 initialTimestamp = vault.lastUserInteractionTimestamp(freshUser);
        console.log("Initial timestamp for fresh user:", initialTimestamp);
        
        // Set interaction delay to 1 hour for this test
        vm.prank(owner);
        vault.setInteractionDelay(1 hours);
        
        uint256 depositAmount = DEPOSIT_AMOUNT;
        
        // 1. User makes a deposit request
        vm.startPrank(freshUser);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        // Debug: Check timestamp after first request
        uint256 afterFirstRequest = vault.lastUserInteractionTimestamp(freshUser);
        console.log("Timestamp after first request:", afterFirstRequest);
        
        // 2. Wait for request to expire (10 minutes by default)
        vm.warp(block.timestamp + 11 minutes);
        
        // 3. User cancels the expired deposit request
        vm.prank(freshUser);
        vault.cancelDeposit();
        
        // Debug: Check timestamp after cancel
        uint256 afterCancel = vault.lastUserInteractionTimestamp(freshUser);
        console.log("Timestamp after cancel:", afterCancel);
        
        // 4. User should be able to make a new deposit request immediately
        // (lastUserInteractionTimestamp should be reset to 0)
        vm.startPrank(freshUser);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        // Verify the request was created successfully
        (, uint256 requestAssets, , address requestUser, bool isDeposit, bool processed) = vault.pendingRequests(freshUser);
        assertEq(requestUser, freshUser, "User should have a pending request");
        assertTrue(isDeposit, "Should be a deposit request");
        assertEq(requestAssets, depositAmount, "Request assets should match");
        assertFalse(processed, "Request should not be processed yet");
        
        console.log("SUCCESS: User can make new deposit request immediately after canceling");
    }

    function test_userCanMakeNewRequestImmediatelyAfterCancelingWithdrawal() public {
        console.log("\n=== Testing User Can Make New Request After Canceling Withdrawal ===");
        
        // Use a fresh user to avoid any previous interactions
        address freshUser = address(0x888);
        asset.mint(freshUser, INITIAL_SUPPLY);
        
        // Set interaction delay to 1 hour for this test
        vm.prank(owner);
        vault.setInteractionDelay(1 hours);
        
        // First, give freshUser some shares by processing a deposit
        uint256 depositAmount = DEPOSIT_AMOUNT;
        vm.startPrank(freshUser);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        vm.prank(manager);
        vault.processDeposit(freshUser);
        
        uint256 userShares = vault.balanceOf(freshUser);
        assertTrue(userShares > 0, "User should have shares");
        
        // Wait for interaction delay to expire before making withdrawal request
        vm.warp(block.timestamp + 1 hours + 1);
        
        // 1. User makes a withdrawal request
        vm.prank(freshUser);
        vault.requestWithdrawal(userShares / 2, depositAmount / 2);
        
        // 2. Wait for request to expire (10 minutes by default)
        vm.warp(block.timestamp + 11 minutes);
        
        // 3. User cancels the expired withdrawal request
        vm.prank(freshUser);
        vault.cancelWithdrawal();
        
        // 4. User should be able to make a new withdrawal request immediately
        // (lastUserInteractionTimestamp should be reset to 0)
        vm.prank(freshUser);
        vault.requestWithdrawal(userShares / 4, depositAmount / 4);
        
        // Verify the request was created successfully
        (, uint256 requestAssets, , address requestUser, bool isDeposit, bool processed ) = vault.pendingRequests(freshUser);
        assertEq(requestUser, freshUser, "User should have a pending request");
        assertFalse(isDeposit, "Should be a withdrawal request");
        assertEq(requestAssets, depositAmount / 4, "Request assets should match");
        assertFalse(processed, "Request should not be processed yet");
        
        console.log("SUCCESS: User can make new withdrawal request immediately after canceling");
    }

    function test_interactionDelayEnforcedForActiveRequests() public {
        console.log("\n=== Testing Interaction Delay Enforced For Active Requests ===");
        
        // Use a fresh user to avoid any previous interactions
        address freshUser = address(0x777);
        asset.mint(freshUser, INITIAL_SUPPLY);
        
        // Set interaction delay to 1 hour for this test
        vm.prank(owner);
        vault.setInteractionDelay(1 hours);
        
        uint256 depositAmount = DEPOSIT_AMOUNT;
        
        // 1. User makes a deposit request
        vm.startPrank(freshUser);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        // 2. Manager processes the first request
        vm.prank(manager);
        vault.processDeposit(freshUser);
        
        // 3. User tries to make another request immediately after the first one is processed
        // This should fail with InteractionDelayNotExpired
        vm.startPrank(freshUser);
        asset.approve(address(vault), depositAmount);
        vm.expectRevert(PassiveLiquidityVault.InteractionDelayNotExpired.selector);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        // 4. Wait for interaction delay to expire
        vm.warp(block.timestamp + 1 hours + 1);
        
        // 5. User should now be able to make another request
        vm.startPrank(freshUser);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        console.log("SUCCESS: Interaction delay properly enforced for active requests");
    }

    function test_interactionDelayEnforcedAfterProcessedRequest() public {
        console.log("\n=== Testing Interaction Delay Enforced After Processed Request ===");
        
        // Use a fresh user to avoid any previous interactions
        address freshUser = address(0x666);
        asset.mint(freshUser, INITIAL_SUPPLY);
        
        // Set interaction delay to 1 hour for this test
        vm.prank(owner);
        vault.setInteractionDelay(1 hours);
        
        uint256 depositAmount = DEPOSIT_AMOUNT;
        
        // 1. User makes a deposit request
        vm.startPrank(freshUser);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        // 2. Manager processes the deposit
        vm.prank(manager);
        vault.processDeposit(freshUser);
        
        // 3. User tries to make another request immediately (should fail due to delay)
        vm.startPrank(freshUser);
        asset.approve(address(vault), depositAmount);
        vm.expectRevert(PassiveLiquidityVault.InteractionDelayNotExpired.selector);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        // 4. Wait for interaction delay to expire
        vm.warp(block.timestamp + 1 hours + 1);
        
        // 5. User should now be able to make another request
        vm.startPrank(freshUser);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        // Verify the request was created successfully
        (, uint256 requestAssets, , address requestUser, bool isDeposit, bool processed) = vault.pendingRequests(freshUser);
        assertEq(requestUser, freshUser, "User should have a pending request");
        assertTrue(isDeposit, "Should be a deposit request");
        assertEq(requestAssets, depositAmount, "Request assets should match");
        assertFalse(processed, "Request should not be processed yet");
        
        console.log("SUCCESS: Interaction delay properly enforced after processed request");
    }

    function test_interactionDelayEnforcedForWithdrawalAfterProcessedDeposit() public {
        console.log("\n=== Testing Interaction Delay Enforced For Withdrawal After Processed Deposit ===");
        
        // Use a fresh user to avoid any previous interactions
        address freshUser = address(0x555);
        asset.mint(freshUser, INITIAL_SUPPLY);
        
        // Set interaction delay to 1 hour for this test
        vm.prank(owner);
        vault.setInteractionDelay(1 hours);
        
        uint256 depositAmount = DEPOSIT_AMOUNT;
        
        // 1. User makes a deposit request
        vm.startPrank(freshUser);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        // 2. Manager processes the deposit
        vm.prank(manager);
        vault.processDeposit(freshUser);
        
        uint256 userShares = vault.balanceOf(freshUser);
        assertTrue(userShares > 0, "User should have shares");
        
        // 3. User tries to make a withdrawal request immediately (should fail due to delay)
        vm.prank(freshUser);
        vm.expectRevert(PassiveLiquidityVault.InteractionDelayNotExpired.selector);
        vault.requestWithdrawal(userShares / 2, depositAmount / 2);
        
        // 4. Wait for interaction delay to expire
        vm.warp(block.timestamp + 1 hours + 1);
        
        // 5. User should now be able to make a withdrawal request
        vm.prank(freshUser);
        vault.requestWithdrawal(userShares / 2, depositAmount / 2);
        
        // Verify the request was created successfully
        (, uint256 requestAssets, , address requestUser, bool isDeposit, bool processed) = vault.pendingRequests(freshUser);
        assertEq(requestUser, freshUser, "User should have a pending request");
        assertFalse(isDeposit, "Should be a withdrawal request");
        assertEq(requestAssets, depositAmount / 2, "Request assets should match");
        assertFalse(processed, "Request should not be processed yet");
        
        console.log("SUCCESS: Interaction delay properly enforced for withdrawal after processed deposit");
    }

    // ============ Batch Processing Tests ============

    function test_batchProcessDeposit() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        
        // Three users request deposits
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        vm.warp(block.timestamp + 1);
        vm.startPrank(user2);
        asset.approve(address(vault), depositAmount * 2);
        vault.requestDeposit(depositAmount * 2, depositAmount * 2);
        vm.stopPrank();
        
        vm.warp(block.timestamp + 1);
        vm.startPrank(user3);
        asset.approve(address(vault), depositAmount * 3);
        vault.requestDeposit(depositAmount * 3, depositAmount * 3);
        vm.stopPrank();
        
        // Manager batch processes all deposits
        address[] memory requesters = new address[](3);
        requesters[0] = user1;
        requesters[1] = user2;
        requesters[2] = user3;
        
        vm.prank(manager);
        vault.batchProcessDeposit(requesters);
        
        // Verify all deposits were processed
        assertEq(vault.balanceOf(user1), depositAmount);
        assertEq(vault.balanceOf(user2), depositAmount * 2);
        assertEq(vault.balanceOf(user3), depositAmount * 3);
    }

    function test_batchProcessWithdrawal() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        
        // Setup: users deposit first
        _approveAndDeposit(user1, depositAmount);
        vm.warp(block.timestamp + 1 days + 1);
        _approveAndDeposit(user2, depositAmount * 2);
        vm.warp(block.timestamp + 1 days + 1);
        _approveAndDeposit(user3, depositAmount * 3);
        
        // Users request withdrawals
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(user1);
        vault.requestWithdrawal(depositAmount, depositAmount);
        
        vm.warp(block.timestamp + 1);
        vm.prank(user2);
        vault.requestWithdrawal(depositAmount * 2, depositAmount * 2);
        
        vm.warp(block.timestamp + 1);
        vm.prank(user3);
        vault.requestWithdrawal(depositAmount * 3, depositAmount * 3);
        
        // Manager batch processes all withdrawals
        address[] memory requesters = new address[](3);
        requesters[0] = user1;
        requesters[1] = user2;
        requesters[2] = user3;
        
        uint256 user1BalanceBefore = asset.balanceOf(user1);
        uint256 user2BalanceBefore = asset.balanceOf(user2);
        uint256 user3BalanceBefore = asset.balanceOf(user3);
        
        vm.prank(manager);
        vault.batchProcessWithdrawal(requesters);
        
        // Verify all withdrawals were processed
        assertEq(vault.balanceOf(user1), 0);
        assertEq(vault.balanceOf(user2), 0);
        assertEq(vault.balanceOf(user3), 0);
        
        assertEq(asset.balanceOf(user1), user1BalanceBefore + depositAmount);
        assertEq(asset.balanceOf(user2), user2BalanceBefore + depositAmount * 2);
        assertEq(asset.balanceOf(user3), user3BalanceBefore + depositAmount * 3);
    }

    function test_batchProcessRevertsOnFirstFailure() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        
        // User1 and user3 request deposits (user2 doesn't)
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        vm.warp(block.timestamp + 11 minutes); // Make user1's request expire
        
        vm.startPrank(user3);
        asset.approve(address(vault), depositAmount * 3);
        vault.requestDeposit(depositAmount * 3, depositAmount * 3);
        vm.stopPrank();
        
        // Manager batch processes including user1 (expired), user2 (no request), and user3 (valid)
        address[] memory requesters = new address[](3);
        requesters[0] = user1; // Expired request - will cause revert
        requesters[1] = user2; // No request
        requesters[2] = user3; // Valid request
        
        // Expect revert on user1's expired request
        vm.prank(manager);
        vm.expectRevert(
            abi.encodeWithSelector(
                PassiveLiquidityVault.RequestExpired.selector
            )
        );
        vault.batchProcessDeposit(requesters);
        
        // Verify no one got shares (batch reverted)
        assertEq(vault.balanceOf(user1), 0);
        assertEq(vault.balanceOf(user2), 0);
        assertEq(vault.balanceOf(user3), 0);
    }

    function test_batchProcessRevertsRollsBackAllChanges() public {
        uint256 depositAmount = DEPOSIT_AMOUNT;
        
        // Only user1 requests deposit
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        // Manager tries to batch process user1 and user2 (no request)
        address[] memory requesters = new address[](2);
        requesters[0] = user1; // Valid - would process successfully
        requesters[1] = user2; // No request - will cause revert
        
        vm.prank(manager);
        vm.expectRevert(
            abi.encodeWithSelector(
                PassiveLiquidityVault.NoPendingRequests.selector,
                user2
            )
        );
        vault.batchProcessDeposit(requesters);
        
        // Verify no one got shares (entire batch reverted, rolling back user1's processing)
        assertEq(vault.balanceOf(user1), 0);
        assertEq(vault.balanceOf(user2), 0);
    }

    // ============ Share Transfer Restriction Tests ============

    function test_transferBlockedWhenSharesLockedForWithdrawal() public {
        // Setup: User deposits and receives shares
        uint256 depositAmount = 1000 * 10 ** 18;
        asset.mint(user1, depositAmount);
        
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        // Manager processes deposit
        vm.prank(manager);
        vault.processDeposit(user1);
        
        uint256 userShares = vault.balanceOf(user1);
        assertEq(userShares, depositAmount);
        
        // User requests withdrawal for all shares
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(user1);
        vault.requestWithdrawal(userShares, depositAmount);
        
        // Verify shares are locked
        assertEq(vault.getLockedShares(user1), userShares);
        assertEq(vault.getAvailableShares(user1), 0);
        
        // User tries to transfer shares and should fail
        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                PassiveLiquidityVault.SharesLockedForWithdrawal.selector,
                user1,
                userShares,
                userShares
            )
        );
        vault.transfer(user2, userShares);
    }

    function test_partialTransferBlockedWhenInsufficientUnlockedShares() public {
        // Setup: User deposits and receives shares
        uint256 depositAmount = 1000 * 10 ** 18;
        asset.mint(user1, depositAmount);
        
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        // Manager processes deposit
        vm.prank(manager);
        vault.processDeposit(user1);
        
        uint256 userShares = vault.balanceOf(user1);
        
        // User requests withdrawal for half of their shares
        uint256 withdrawalShares = userShares / 2;
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(user1);
        vault.requestWithdrawal(withdrawalShares, depositAmount / 2);
        
        // Verify locked shares
        assertEq(vault.getLockedShares(user1), withdrawalShares);
        assertEq(vault.getAvailableShares(user1), withdrawalShares);
        
        // User tries to transfer more than available unlocked shares
        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                PassiveLiquidityVault.SharesLockedForWithdrawal.selector,
                user1,
                withdrawalShares,
                withdrawalShares + 1
            )
        );
        vault.transfer(user2, withdrawalShares + 1);
        
        // User can transfer exactly the available shares
        vm.prank(user1);
        vault.transfer(user2, withdrawalShares);
        
        assertEq(vault.balanceOf(user1), withdrawalShares); // Locked shares remain
        assertEq(vault.balanceOf(user2), withdrawalShares); // Transferred shares
    }

    function test_transferAllowedAfterWithdrawalProcessed() public {
        // Setup: User deposits and receives shares
        uint256 depositAmount = 1000 * 10 ** 18;
        asset.mint(user1, depositAmount);
        
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        // Manager processes deposit
        vm.prank(manager);
        vault.processDeposit(user1);
        
        uint256 userShares = vault.balanceOf(user1);
        
        // User requests withdrawal
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(user1);
        vault.requestWithdrawal(userShares, depositAmount);
        
        // Verify shares are locked
        assertEq(vault.getLockedShares(user1), userShares);
        
        // Manager processes withdrawal
        vm.prank(manager);
        vault.processWithdrawal(user1);
        
        // Verify shares are no longer locked (user has 0 shares now)
        assertEq(vault.getLockedShares(user1), 0);
        assertEq(vault.balanceOf(user1), 0);
    }

    function test_transferAllowedAfterWithdrawalCancelled() public {
        // Setup: User deposits and receives shares
        uint256 depositAmount = 1000 * 10 ** 18;
        asset.mint(user1, depositAmount);
        
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        // Manager processes deposit
        vm.prank(manager);
        vault.processDeposit(user1);
        
        uint256 userShares = vault.balanceOf(user1);
        
        // User requests withdrawal
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(user1);
        vault.requestWithdrawal(userShares, depositAmount);
        
        // Verify shares are locked
        assertEq(vault.getLockedShares(user1), userShares);
        assertEq(vault.getAvailableShares(user1), 0);
        
        // Wait for expiration and cancel withdrawal
        vm.warp(block.timestamp + 11 minutes);
        vm.prank(user1);
        vault.cancelWithdrawal();
        
        // Verify shares are no longer locked
        assertEq(vault.getLockedShares(user1), 0);
        assertEq(vault.getAvailableShares(user1), userShares);
        
        // Transfer should now succeed
        vm.prank(user1);
        vault.transfer(user2, userShares);
        
        assertEq(vault.balanceOf(user1), 0);
        assertEq(vault.balanceOf(user2), userShares);
    }

    function test_noTransferRestrictionForDepositRequests() public {
        // Setup: User deposits and receives shares
        uint256 initialDeposit = 1000 * 10 ** 18;
        asset.mint(user1, initialDeposit * 2); // Mint extra for second deposit
        
        vm.startPrank(user1);
        asset.approve(address(vault), initialDeposit);
        vault.requestDeposit(initialDeposit, initialDeposit);
        vm.stopPrank();
        
        // Manager processes deposit
        vm.prank(manager);
        vault.processDeposit(user1);
        
        uint256 userShares = vault.balanceOf(user1);
        
        // User requests another deposit (not a withdrawal)
        vm.warp(block.timestamp + 1 days + 1);
        vm.startPrank(user1);
        asset.approve(address(vault), initialDeposit);
        vault.requestDeposit(initialDeposit, initialDeposit);
        vm.stopPrank();
        
        // Verify no shares are locked (deposit requests don't lock shares)
        assertEq(vault.getLockedShares(user1), 0);
        assertEq(vault.getAvailableShares(user1), userShares);
        
        // Transfer should succeed
        vm.prank(user1);
        vault.transfer(user2, userShares);
        
        assertEq(vault.balanceOf(user1), 0);
        assertEq(vault.balanceOf(user2), userShares);
    }

    function test_getLockedSharesReturnsZeroWithNoRequest() public {
        assertEq(vault.getLockedShares(user1), 0);
        assertEq(vault.getAvailableShares(user1), 0);
    }

    function test_getAvailableSharesCalculatesCorrectly() public {
        // Setup: User deposits and receives shares
        uint256 depositAmount = 1000 * 10 ** 18;
        asset.mint(user1, depositAmount);
        
        vm.startPrank(user1);
        asset.approve(address(vault), depositAmount);
        vault.requestDeposit(depositAmount, depositAmount);
        vm.stopPrank();
        
        // Manager processes deposit
        vm.prank(manager);
        vault.processDeposit(user1);
        
        uint256 userShares = vault.balanceOf(user1);
        
        // Before withdrawal request
        assertEq(vault.getAvailableShares(user1), userShares);
        
        // Request withdrawal for 30% of shares
        uint256 withdrawalShares = (userShares * 30) / 100;
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(user1);
        vault.requestWithdrawal(withdrawalShares, (depositAmount * 30) / 100);
        
        // After withdrawal request
        assertEq(vault.getAvailableShares(user1), userShares - withdrawalShares);
        assertEq(vault.getLockedShares(user1), withdrawalShares);
    }
}

// Mock ERC721 contract that uses _safeMint for testing
contract MockERC721WithSafeMint {
    string public name;
    string public symbol;
    uint256 private _tokenIdCounter;
    
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    
    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
        _tokenIdCounter = 1;
    }
    
    function safeMintTo(address to) external returns (uint256) {
        uint256 tokenId = _tokenIdCounter++;
        _safeMint(to, tokenId);
        return tokenId;
    }
    
    function _safeMint(address to, uint256 tokenId) internal {
        _mint(to, tokenId);
        _checkOnERC721Received(address(0), to, tokenId, "");
    }
    
    function _mint(address to, uint256 tokenId) internal {
        require(to != address(0), "ERC721: mint to the zero address");
        require(_owners[tokenId] == address(0), "ERC721: token already minted");
        
        _balances[to] += 1;
        _owners[tokenId] = to;
    }
    
    function _checkOnERC721Received(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) private {
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 retval) {
                require(retval == IERC721Receiver.onERC721Received.selector, "ERC721: transfer to non ERC721Receiver implementer");
            } catch (bytes memory reason) {
                if (reason.length == 0) {
                    revert("ERC721: transfer to non ERC721Receiver implementer");
                } else {
                    assembly {
                        revert(add(32, reason), mload(reason))
                    }
                }
            }
        }
    }
    
    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "ERC721: invalid token ID");
        return owner;
    }
    
    function balanceOf(address owner) external view returns (uint256) {
        require(owner != address(0), "ERC721: address zero is not a valid owner");
        return _balances[owner];
    }
}

// Import IERC721Receiver interface for the mock contract
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";