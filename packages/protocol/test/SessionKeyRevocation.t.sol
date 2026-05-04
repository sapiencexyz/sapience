// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/PredictionMarketEscrow.sol";
import "../src/PredictionMarketTokenFactory.sol";
import "../src/SecondaryMarketEscrow.sol";
import "../src/interfaces/ISecondaryMarketEscrow.sol";
import "../src/utils/SignatureValidator.sol";
import "./mocks/MockERC20.sol";

/**
 * @title SessionKeyRevocationTest
 * @notice Coverage for the on-chain advisory revocation registry on
 *         PredictionMarketEscrow and SecondaryMarketEscrow.
 *
 * The legacy session-key validation path was removed (it could not see
 * smart-account validator rotations, so a rotated-out owner could keep
 * authorizing transfers). The revocation registry remains as a public
 * caller-scoped on-chain log so dapps and indexers can keep tracking
 * session-key invalidations; the contract itself no longer reads it during
 * signature validation.
 */
contract SessionKeyRevocationTest is Test {
    PredictionMarketEscrow public market;
    SecondaryMarketEscrow public secondaryMarket;
    MockERC20 public collateralToken;

    address public admin;
    address public ownerAddr;
    address public sessionKeyAddr;
    address public sessionKey2Addr;
    address public counterparty;

    function setUp() public {
        admin = vm.addr(1);
        ownerAddr = vm.addr(10);
        sessionKeyAddr = vm.addr(11);
        sessionKey2Addr = vm.addr(12);
        counterparty = vm.addr(3);

        collateralToken = new MockERC20("Test USDE", "USDE", 18);

        PredictionMarketTokenFactory tokenFactory =
            new PredictionMarketTokenFactory(admin);
        market = new PredictionMarketEscrow(
            address(collateralToken), admin, address(tokenFactory)
        );
        vm.prank(admin);
        tokenFactory.setDeployer(address(market));

        secondaryMarket = new SecondaryMarketEscrow();
    }

    // ============ PredictionMarketEscrow Registry ============

    function test_M2_revocationEmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit SignatureValidator.SessionKeyRevoked(
            ownerAddr, sessionKeyAddr, block.timestamp
        );

        vm.prank(ownerAddr);
        market.revokeSessionKey(sessionKeyAddr);
    }

    function test_M2_isSessionKeyRevokedCorrectness() public {
        assertFalse(market.isSessionKeyRevoked(ownerAddr, sessionKeyAddr));

        vm.prank(ownerAddr);
        market.revokeSessionKey(sessionKeyAddr);

        assertTrue(market.isSessionKeyRevoked(ownerAddr, sessionKeyAddr));
    }

    function test_M2_revocationIsCallerScoped() public {
        // Revocations are keyed by msg.sender — different callers operate on
        // independent registry slots.
        vm.prank(counterparty);
        market.revokeSessionKey(sessionKeyAddr);

        assertFalse(market.isSessionKeyRevoked(ownerAddr, sessionKeyAddr));
        assertTrue(market.isSessionKeyRevoked(counterparty, sessionKeyAddr));
    }

    function test_M2_revokingOneKeyDoesNotAffectAnother() public {
        vm.prank(ownerAddr);
        market.revokeSessionKey(sessionKeyAddr);

        assertTrue(market.isSessionKeyRevoked(ownerAddr, sessionKeyAddr));
        assertFalse(market.isSessionKeyRevoked(ownerAddr, sessionKey2Addr));
    }

    // ============ SecondaryMarketEscrow Registry ============

    function test_M2_secondaryMarket_isIndependent() public {
        // Revoke on PredictionMarketEscrow only.
        vm.prank(ownerAddr);
        market.revokeSessionKey(sessionKeyAddr);

        assertFalse(
            secondaryMarket.isSessionKeyRevoked(ownerAddr, sessionKeyAddr)
        );

        vm.prank(ownerAddr);
        secondaryMarket.revokeSessionKey(sessionKeyAddr);

        assertTrue(
            secondaryMarket.isSessionKeyRevoked(ownerAddr, sessionKeyAddr)
        );
    }

    function test_M2_secondaryMarket_revocationEmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit ISecondaryMarketEscrow.SessionKeyRevoked(
            ownerAddr, sessionKeyAddr, block.timestamp
        );

        vm.prank(ownerAddr);
        secondaryMarket.revokeSessionKey(sessionKeyAddr);
    }
}
