// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../../src/v2/sponsors/MatchedSponsor.sol";
import "../../src/v2/interfaces/IV2Types.sol";
import "./mocks/MockERC20.sol";

contract MatchedSponsorTest is Test {
    MatchedSponsor public sponsor;
    MockERC20 public collateral;

    address public owner = makeAddr("owner");
    address public escrow = makeAddr("escrow");
    address public manager = makeAddr("manager");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public eve = makeAddr("eve");

    uint256 public constant MATCH_LIMIT = 1e18;
    uint256 public constant BUDGET = 5e18;

    function setUp() public {
        collateral = new MockERC20("WUSDe", "WUSDe", 18);
        sponsor = new MatchedSponsor(escrow, address(collateral), MATCH_LIMIT, owner);

        // Fund the sponsor contract
        collateral.mint(address(sponsor), 100e18);

        // Set up budget manager
        vm.prank(owner);
        sponsor.setBudgetManager(manager);
    }

    // ============ Deployment ============

    function test_constructor() public view {
        assertEq(sponsor.escrow(), escrow);
        assertEq(address(sponsor.collateralToken()), address(collateral));
        assertEq(sponsor.matchLimit(), MATCH_LIMIT);
        assertEq(sponsor.owner(), owner);
    }

    // ============ setBudget ============

    function test_setBudget_asManager() public {
        vm.prank(manager);
        sponsor.setBudget(alice, BUDGET);

        (uint256 allocated, uint256 used) = sponsor.budgets(alice);
        assertEq(allocated, BUDGET);
        assertEq(used, 0);
    }

    function test_setBudget_asOwner() public {
        vm.prank(owner);
        sponsor.setBudget(alice, BUDGET);

        (uint256 allocated,) = sponsor.budgets(alice);
        assertEq(allocated, BUDGET);
    }

    function test_setBudget_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit MatchedSponsor.BudgetSet(alice, BUDGET);

        vm.prank(manager);
        sponsor.setBudget(alice, BUDGET);
    }

    function test_setBudget_revert_unauthorized() public {
        vm.prank(eve);
        vm.expectRevert(MatchedSponsor.UnauthorizedBudgetManager.selector);
        sponsor.setBudget(alice, BUDGET);
    }

    // ============ setBudgets (batch) ============

    function test_setBudgets_batch() public {
        address[] memory users = new address[](2);
        users[0] = alice;
        users[1] = bob;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1e18;
        amounts[1] = 2e18;

        vm.prank(manager);
        sponsor.setBudgets(users, amounts);

        (uint256 aliceAlloc,) = sponsor.budgets(alice);
        (uint256 bobAlloc,) = sponsor.budgets(bob);
        assertEq(aliceAlloc, 1e18);
        assertEq(bobAlloc, 2e18);
    }

    function test_setBudgets_revert_lengthMismatch() public {
        address[] memory users = new address[](2);
        users[0] = alice;
        users[1] = bob;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1e18;

        vm.prank(manager);
        vm.expectRevert(MatchedSponsor.ArrayLengthMismatch.selector);
        sponsor.setBudgets(users, amounts);
    }

    // ============ fundMint ============

    function test_fundMint() public {
        vm.prank(manager);
        sponsor.setBudget(alice, BUDGET);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](0);

        vm.prank(escrow);
        sponsor.fundMint(escrow, alice, MATCH_LIMIT, picks, "");

        (uint256 allocated, uint256 used) = sponsor.budgets(alice);
        assertEq(allocated, BUDGET);
        assertEq(used, MATCH_LIMIT);
        assertEq(collateral.balanceOf(escrow), MATCH_LIMIT);
    }

    function test_fundMint_multipleMints() public {
        vm.prank(manager);
        sponsor.setBudget(alice, 3e18);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](0);

        vm.startPrank(escrow);
        sponsor.fundMint(escrow, alice, MATCH_LIMIT, picks, "");
        sponsor.fundMint(escrow, alice, MATCH_LIMIT, picks, "");
        sponsor.fundMint(escrow, alice, MATCH_LIMIT, picks, "");
        vm.stopPrank();

        (, uint256 used) = sponsor.budgets(alice);
        assertEq(used, 3e18);
    }

    function test_fundMint_emitsEvent() public {
        vm.prank(manager);
        sponsor.setBudget(alice, BUDGET);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](0);

        vm.expectEmit(true, true, false, true);
        emit MatchedSponsor.Sponsored(alice, MATCH_LIMIT, escrow);

        vm.prank(escrow);
        sponsor.fundMint(escrow, alice, MATCH_LIMIT, picks, "");
    }

    function test_fundMint_revert_unauthorizedEscrow() public {
        vm.prank(manager);
        sponsor.setBudget(alice, BUDGET);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](0);

        vm.prank(eve);
        vm.expectRevert(MatchedSponsor.UnauthorizedEscrow.selector);
        sponsor.fundMint(escrow, alice, MATCH_LIMIT, picks, "");
    }

    function test_fundMint_revert_exceedsMatchLimit() public {
        vm.prank(manager);
        sponsor.setBudget(alice, BUDGET);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](0);

        vm.prank(escrow);
        vm.expectRevert(MatchedSponsor.CollateralExceedsMatchLimit.selector);
        sponsor.fundMint(escrow, alice, MATCH_LIMIT + 1, picks, "");
    }

    function test_fundMint_revert_noBudget() public {
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](0);

        vm.prank(escrow);
        vm.expectRevert(MatchedSponsor.NoBudget.selector);
        sponsor.fundMint(escrow, alice, MATCH_LIMIT, picks, "");
    }

    function test_fundMint_revert_budgetExceeded() public {
        vm.prank(manager);
        sponsor.setBudget(alice, MATCH_LIMIT); // budget == match limit, only 1 mint

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](0);

        vm.prank(escrow);
        sponsor.fundMint(escrow, alice, MATCH_LIMIT, picks, "");

        vm.prank(escrow);
        vm.expectRevert(MatchedSponsor.BudgetExceeded.selector);
        sponsor.fundMint(escrow, alice, MATCH_LIMIT, picks, "");
    }

    // ============ remainingBudget ============

    function test_remainingBudget() public {
        vm.prank(manager);
        sponsor.setBudget(alice, BUDGET);

        assertEq(sponsor.remainingBudget(alice), BUDGET);

        IV2Types.Pick[] memory picks = new IV2Types.Pick[](0);
        vm.prank(escrow);
        sponsor.fundMint(escrow, alice, MATCH_LIMIT, picks, "");

        assertEq(sponsor.remainingBudget(alice), BUDGET - MATCH_LIMIT);
    }

    function test_remainingBudget_zero() public view {
        assertEq(sponsor.remainingBudget(alice), 0);
    }

    // ============ Owner admin ============

    function test_setBudgetManager() public {
        vm.expectEmit(true, false, false, true);
        emit MatchedSponsor.BudgetManagerSet(eve);

        vm.prank(owner);
        sponsor.setBudgetManager(eve);
        assertEq(sponsor.budgetManager(), eve);
    }

    function test_setBudgetManager_revert_notOwner() public {
        vm.prank(eve);
        vm.expectRevert();
        sponsor.setBudgetManager(eve);
    }

    function test_setMatchLimit() public {
        vm.expectEmit(false, false, false, true);
        emit MatchedSponsor.MatchLimitSet(10e18);

        vm.prank(owner);
        sponsor.setMatchLimit(10e18);
        assertEq(sponsor.matchLimit(), 10e18);
    }

    function test_setMatchLimit_revert_notOwner() public {
        vm.prank(eve);
        vm.expectRevert();
        sponsor.setMatchLimit(10e18);
    }

    // ============ Sweep ============

    function test_sweepToken() public {
        uint256 balance = collateral.balanceOf(address(sponsor));

        vm.prank(owner);
        sponsor.sweepToken(IERC20(address(collateral)), owner, balance);

        assertEq(collateral.balanceOf(owner), balance);
        assertEq(collateral.balanceOf(address(sponsor)), 0);
    }

    function test_sweepToken_revert_notOwner() public {
        vm.prank(eve);
        vm.expectRevert();
        sponsor.sweepToken(IERC20(address(collateral)), eve, 1e18);
    }

    function test_sweepNative() public {
        vm.deal(address(sponsor), 1 ether);

        vm.prank(owner);
        sponsor.sweepNative(payable(owner), 1 ether);

        assertEq(address(owner).balance, 1 ether);
        assertEq(address(sponsor).balance, 0);
    }

    function test_sweepNative_revert_notOwner() public {
        vm.deal(address(sponsor), 1 ether);

        vm.prank(eve);
        vm.expectRevert();
        sponsor.sweepNative(payable(eve), 1 ether);
    }

    // ============ Receive ============

    function test_receiveNative() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool success,) = address(sponsor).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(sponsor).balance, 1 ether);
    }
}
