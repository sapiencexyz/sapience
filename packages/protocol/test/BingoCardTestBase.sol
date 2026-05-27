// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";

import "../src/bingo/BingoCard.sol";
import "./mocks/MockERC20.sol";
import "./mocks/MockEntropy.sol";

/// @notice Shared setup for BingoCard tests. Deploys the contract with a mock
///         ERC20 as collateral and a MockEntropy as the randomness source.
abstract contract BingoCardTestBase is Test {
    BingoCard internal bingo;
    MockERC20 internal collateral;
    MockEntropy internal entropy;

    address internal owner = address(0xA11CE);
    address internal player = address(0xB0B);
    address internal referrer = address(0xCAFE);
    address internal escrow = address(0xE5C0);
    address internal entropyProvider = address(0xBEEF);

    uint128 internal constant ENTROPY_FEE = 1 wei;
    uint256 internal constant DECIMALS = 1e18;
    uint256 internal constant CARD_PRICE = 5 * DECIMALS;
    uint16 internal constant REFERRAL_BPS = 200; // 2%
    uint64 internal constant CARD_EXPIRY = 30 days;

    function setUp() public virtual {
        collateral = new MockERC20("USDe", "USDe", 18);
        entropy = new MockEntropy();
        entropy.setFee(ENTROPY_FEE);
        bingo = new BingoCard(
            address(collateral), address(entropy), entropyProvider, owner
        );

        vm.deal(player, 1 ether);
    }

    /// @notice Seeds a small but valid pool of 20 conditions (>= CELLS_PER_CARD).
    function _seedDefaultPool() internal {
        bytes32[] memory ids = new bytes32[](20);
        address[] memory resolvers = new address[](20);
        for (uint256 i = 0; i < 20; i++) {
            ids[i] = keccak256(abi.encode("cond", i));
            resolvers[i] = address(uint160(0xC0DE000 + i));
        }
        vm.prank(owner);
        bingo.setPool(ids, resolvers);
    }

    function _configureDefaults() internal {
        vm.startPrank(owner);
        bingo.setCardPrice(CARD_PRICE);
        bingo.setReferralBps(REFERRAL_BPS);
        bingo.setCardExpiry(CARD_EXPIRY);
        vm.stopPrank();
    }
}
