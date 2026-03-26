// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/PredictionMarketEscrow.sol";
import "../src/PredictionMarketTokenFactory.sol";
import "../src/resolvers/mocks/ManualConditionResolver.sol";
import "../src/interfaces/IV2Types.sol";
import "../src/interfaces/IPredictionMarketToken.sol";
import "../src/vault/PredictionMarketVault.sol";
import "./mocks/MockERC20.sol";

contract PredictionMarketVaultRedeemTest is Test {
    PredictionMarketEscrow public market;
    PredictionMarketVault public vault;
    ManualConditionResolver public resolver;
    MockERC20 public collateralToken;

    address public owner;
    address public predictor;
    address public manager; // vault-bot EOA
    address public settler;

    uint256 public predictorPk;
    uint256 public vaultPk; // vault signs via ERC-1271 but we need the manager

    uint256 public constant PREDICTOR_COLLATERAL = 100e18;
    uint256 public constant COUNTERPARTY_COLLATERAL = 150e18;
    uint256 public constant TOTAL_COLLATERAL =
        PREDICTOR_COLLATERAL + COUNTERPARTY_COLLATERAL;
    bytes32 public constant REF_CODE = keccak256("test-ref-code");

    bytes32 public rawConditionId1;
    bytes public conditionId1;

    uint256 private _nextNonce = 1;

    function setUp() public {
        owner = vm.addr(1);
        predictorPk = 2;
        predictor = vm.addr(predictorPk);
        manager = vm.addr(4);
        settler = vm.addr(5);

        // Deploy collateral token
        collateralToken = new MockERC20("Test USDE", "USDE", 18);

        // Deploy escrow
        PredictionMarketTokenFactory tokenFactory =
            new PredictionMarketTokenFactory(owner);
        market = new PredictionMarketEscrow(
            address(collateralToken), owner, address(tokenFactory)
        );
        vm.prank(owner);
        tokenFactory.setDeployer(address(market));

        // Deploy vault with manager
        vm.prank(owner);
        vault = new PredictionMarketVault(
            address(collateralToken), manager, "Sapience Vault", "sVault"
        );

        // Deploy resolver
        vm.prank(owner);
        resolver = new ManualConditionResolver(owner);
        vm.prank(owner);
        resolver.approveSettler(settler);

        rawConditionId1 = keccak256(abi.encode("condition-1"));
        conditionId1 = abi.encode(rawConditionId1);

        // Fund predictor
        collateralToken.mint(predictor, 10_000e18);
        vm.prank(predictor);
        collateralToken.approve(address(market), type(uint256).max);

        // Fund vault (simulate deposits)
        collateralToken.mint(address(vault), 10_000e18);

        // Vault approves escrow to spend its collateral
        vm.prank(manager);
        vault.approveFundsUsage(address(market), 10_000e18);
    }

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
    }

    function _buildVaultDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("SignatureProcessor"),
                keccak256("1"),
                block.chainid,
                address(vault)
            )
        );
    }

    function _signVaultApproval(bytes32 rawHash)
        internal
        view
        returns (bytes memory)
    {
        bytes32 approveTypehash =
            keccak256("Approve(bytes32 messageHash,address owner)");
        bytes32 structHash =
            keccak256(abi.encode(approveTypehash, rawHash, manager));
        bytes32 typedDataHash = keccak256(
            abi.encodePacked(
                "\x19\x01", _buildVaultDomainSeparator(), structHash
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(4, typedDataHash);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Mint a prediction with vault as counterparty
    /// @return predictionId The prediction ID (for settle)
    /// @return predictorToken The predictor position token
    /// @return counterpartyToken The counterparty position token
    function _mintWithVaultAsCounterparty(IV2Types.Pick[] memory picks)
        internal
        returns (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        )
    {
        bytes32 _pickConfigId = keccak256(abi.encode(picks));

        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        IV2Types.MintRequest memory request;
        request.picks = picks;
        request.predictorCollateral = PREDICTOR_COLLATERAL;
        request.counterpartyCollateral = COUNTERPARTY_COLLATERAL;
        request.predictor = predictor;
        request.counterparty = address(vault);
        request.predictorNonce = pNonce;
        request.counterpartyNonce = cNonce;
        request.predictorDeadline = deadline;
        request.counterpartyDeadline = deadline;
        request.refCode = REF_CODE;
        request.predictorSessionKeyData = "";
        request.counterpartySessionKeyData = "";
        request.predictorSponsor = address(0);
        request.predictorSponsorData = "";

        {
            bytes32 predictionHash = keccak256(
                abi.encode(
                    _pickConfigId,
                    PREDICTOR_COLLATERAL,
                    COUNTERPARTY_COLLATERAL,
                    predictor,
                    address(vault),
                    address(0),
                    ""
                )
            );

            request.predictorSignature = _signApproval(
                predictionHash,
                predictor,
                PREDICTOR_COLLATERAL,
                pNonce,
                deadline,
                predictorPk
            );

            bytes32 counterpartyApprovalHash = market.getMintApprovalHash(
                predictionHash,
                address(vault),
                COUNTERPARTY_COLLATERAL,
                cNonce,
                deadline
            );
            request.counterpartySignature =
                _signVaultApproval(counterpartyApprovalHash);
        }

        (bytes32 _predictionId, address pToken, address cToken) =
            market.mint(request);
        return (_predictionId, pToken, cToken);
    }

    function _signApproval(
        bytes32 predictionHash,
        address signer,
        uint256 collateral,
        uint256 nonce,
        uint256 deadline,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 approvalHash = market.getMintApprovalHash(
            predictionHash, signer, collateral, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, approvalHash);
        return abi.encodePacked(r, s, v);
    }

    // ============ Redeem Tests ============

    function test_redeemFromEscrow_vaultWins() public {
        // Setup: mint prediction with vault as counterparty
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: conditionId1,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        (bytes32 predictionId,, address counterpartyToken) =
            _mintWithVaultAsCounterparty(picks);

        // Settle: counterparty (vault) wins — predictor predicted YES, outcome is NO
        vm.prank(settler);
        resolver.settleCondition(rawConditionId1, IV2Types.OutcomeVector(0, 1));

        market.settle(predictionId, REF_CODE);

        // Vault token balance
        uint256 vaultTokenBalance =
            IERC20(counterpartyToken).balanceOf(address(vault));
        assertGt(vaultTokenBalance, 0, "Vault should hold counterparty tokens");

        // Record collateral balance before
        uint256 vaultCollateralBefore =
            collateralToken.balanceOf(address(vault));

        // Manager calls redeemFromEscrow
        vm.prank(manager);
        uint256 payout = vault.redeemFromEscrow(
            address(market), counterpartyToken, vaultTokenBalance, REF_CODE
        );

        // Vault should have received total collateral (both sides)
        assertEq(payout, TOTAL_COLLATERAL, "Payout should be total collateral");
        assertEq(
            collateralToken.balanceOf(address(vault)),
            vaultCollateralBefore + payout,
            "Vault collateral should increase by payout"
        );

        // Position tokens should be burned
        assertEq(
            IERC20(counterpartyToken).balanceOf(address(vault)),
            0,
            "Vault should have no position tokens after redeem"
        );
    }

    function test_redeemFromEscrow_onlyManager() public {
        // Non-manager cannot call redeemFromEscrow
        vm.prank(predictor);
        vm.expectRevert();
        vault.redeemFromEscrow(address(market), address(1), 100, REF_CODE);
    }

    function test_redeemFromEscrow_revertZeroAmount() public {
        vm.prank(manager);
        vm.expectRevert();
        vault.redeemFromEscrow(address(market), address(1), 0, REF_CODE);
    }

    function test_redeemFromEscrow_revertZeroEscrow() public {
        vm.prank(manager);
        vm.expectRevert();
        vault.redeemFromEscrow(address(0), address(1), 100, REF_CODE);
    }

    // ============ Burn Tests ============

    function test_burnFromEscrow_mutualCancel() public {
        // Mint prediction with vault as counterparty
        IV2Types.Pick[] memory picks = new IV2Types.Pick[](1);
        picks[0] = IV2Types.Pick({
            conditionResolver: address(resolver),
            conditionId: conditionId1,
            predictedOutcome: IV2Types.OutcomeSide.YES
        });

        (
            bytes32 predictionId,
            address predictorToken,
            address counterpartyToken
        ) = _mintWithVaultAsCounterparty(picks);

        bytes32 pickConfigId = keccak256(abi.encode(picks));

        // Both sides agree to cancel — each gets their own collateral back
        uint256 pNonce = _freshNonce();
        uint256 cNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        // Each side receives TOTAL_COLLATERAL position tokens at mint
        bytes32 burnHash = keccak256(
            abi.encode(
                pickConfigId,
                TOTAL_COLLATERAL, // predictorTokenAmount (all predictor tokens)
                TOTAL_COLLATERAL, // counterpartyTokenAmount (all counterparty tokens)
                predictor,
                address(vault),
                PREDICTOR_COLLATERAL, // predictorPayout (gets own collateral back)
                COUNTERPARTY_COLLATERAL // counterpartyPayout (gets own collateral back)
            )
        );

        // Predictor signs burn approval (EOA — direct ECDSA)
        bytes memory predictorBurnSig;
        {
            bytes32 predictorBurnApprovalHash = market.getBurnApprovalHash(
                burnHash,
                predictor,
                TOTAL_COLLATERAL,
                PREDICTOR_COLLATERAL,
                pNonce,
                deadline
            );
            (uint8 v, bytes32 r, bytes32 s) =
                vm.sign(predictorPk, predictorBurnApprovalHash);
            predictorBurnSig = abi.encodePacked(r, s, v);
        }

        // Vault signs burn approval (ERC-1271 — manager signs via vault's isValidSignature)
        bytes memory vaultBurnSig;
        {
            bytes32 vaultBurnApprovalHash = market.getBurnApprovalHash(
                burnHash,
                address(vault),
                TOTAL_COLLATERAL,
                COUNTERPARTY_COLLATERAL,
                cNonce,
                deadline
            );
            vaultBurnSig = _signVaultApproval(vaultBurnApprovalHash);
        }

        IV2Types.BurnRequest memory burnRequest;
        burnRequest.pickConfigId = pickConfigId;
        burnRequest.predictorTokenAmount = TOTAL_COLLATERAL;
        burnRequest.counterpartyTokenAmount = TOTAL_COLLATERAL;
        burnRequest.predictorHolder = predictor;
        burnRequest.counterpartyHolder = address(vault);
        burnRequest.predictorPayout = PREDICTOR_COLLATERAL;
        burnRequest.counterpartyPayout = COUNTERPARTY_COLLATERAL;
        burnRequest.predictorNonce = pNonce;
        burnRequest.counterpartyNonce = cNonce;
        burnRequest.predictorDeadline = deadline;
        burnRequest.counterpartyDeadline = deadline;
        burnRequest.predictorSignature = predictorBurnSig;
        burnRequest.counterpartySignature = vaultBurnSig;
        burnRequest.refCode = REF_CODE;
        burnRequest.predictorSessionKeyData = "";
        burnRequest.counterpartySessionKeyData = "";

        // Record balances before
        uint256 predictorBefore = collateralToken.balanceOf(predictor);
        uint256 vaultBefore = collateralToken.balanceOf(address(vault));

        // Manager calls burnFromEscrow
        vm.prank(manager);
        vault.burnFromEscrow(address(market), burnRequest);

        // Predictor gets their collateral back
        assertEq(
            collateralToken.balanceOf(predictor),
            predictorBefore + PREDICTOR_COLLATERAL,
            "Predictor should get collateral back"
        );

        // Vault gets its collateral back
        assertEq(
            collateralToken.balanceOf(address(vault)),
            vaultBefore + COUNTERPARTY_COLLATERAL,
            "Vault should get collateral back"
        );

        // Position tokens should be burned
        assertEq(
            IERC20(predictorToken).balanceOf(predictor),
            0,
            "Predictor tokens burned"
        );
        assertEq(
            IERC20(counterpartyToken).balanceOf(address(vault)),
            0,
            "Vault tokens burned"
        );
    }

    function test_burnFromEscrow_onlyManager() public {
        IV2Types.BurnRequest memory emptyRequest;
        vm.prank(predictor);
        vm.expectRevert();
        vault.burnFromEscrow(address(market), emptyRequest);
    }

    function test_burnFromEscrow_revertZeroEscrow() public {
        IV2Types.BurnRequest memory emptyRequest;
        vm.prank(manager);
        vm.expectRevert();
        vault.burnFromEscrow(address(0), emptyRequest);
    }
}
