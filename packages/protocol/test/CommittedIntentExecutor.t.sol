// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { CommittedIntentExecutor } from "../src/CommittedIntentExecutor.sol";
import { PreMintEscrow } from "../src/PreMintEscrow.sol";
import { CounterpartyVault } from "../src/CounterpartyVault.sol";
import { InsurancePool } from "../src/InsurancePool.sol";
import { OnboardingSponsorV2 } from "../src/sponsors/OnboardingSponsorV2.sol";
import { PredictionMarketEscrow } from "../src/PredictionMarketEscrow.sol";
import {
    PredictionMarketTokenFactory
} from "../src/PredictionMarketTokenFactory.sol";
import {
    ManualConditionResolver
} from "../src/resolvers/mocks/ManualConditionResolver.sol";
import { ICommittedIntent } from "../src/interfaces/ICommittedIntent.sol";
import { IV2Types } from "../src/interfaces/IV2Types.sol";
import {
    IPredictionMarketToken
} from "../src/interfaces/IPredictionMarketToken.sol";
import { MockERC20 } from "./mocks/MockERC20.sol";

/**
 * @title CommittedIntentExecutorTest
 * @notice Tests each worked example from prd-001-committed-intent.md §6
 *         (6.1 through 6.8). Each test asserts final balances + token mints
 *         exactly per the PRD table.
 */
contract CommittedIntentExecutorTest is Test {
    // ============ Actors ============
    address internal owner;
    uint256 internal predictorPk = 0xA11CE;
    address internal predictor;
    uint256 internal cpAPk = 0xB0B;
    address internal cpA;
    uint256 internal cpBPk = 0xCAFE;
    address internal cpB;
    uint256 internal cpCPk = 0xDAD;
    address internal cpC;
    address internal tipRecipient = address(0x7E5);
    address internal budgetManager = address(0xB00);

    // ============ Infra ============
    MockERC20 internal wUSDe;
    ManualConditionResolver internal resolver;
    PredictionMarketTokenFactory internal tokenFactory;
    PredictionMarketEscrow internal escrow;
    OnboardingSponsorV2 internal sponsor;
    CounterpartyVault internal cpVault;
    InsurancePool internal pool;
    PreMintEscrow internal preMint;
    CommittedIntentExecutor internal exec;

    // ============ Fixture state ============
    bytes internal cond1;
    IV2Types.Pick[] internal picks;

    uint256 internal constant COMMON_AMOUNT_IN = 100e18;
    uint256 internal constant COMMON_MIN_FILL_IN = 60e18;
    uint256 internal constant COMMON_MIN_AMOUNT_OUT = 150e18;
    uint256 internal constant COMMON_EXECUTOR_TIP = 0;
    uint256 internal _nonceCursor = 1;

    function setUp() public {
        owner = address(this);
        predictor = vm.addr(predictorPk);
        cpA = vm.addr(cpAPk);
        cpB = vm.addr(cpBPk);
        cpC = vm.addr(cpCPk);

        wUSDe = new MockERC20("WUSDe", "WUSDe", 18);

        tokenFactory = new PredictionMarketTokenFactory(owner);
        escrow = new PredictionMarketEscrow(
            address(wUSDe), owner, address(tokenFactory)
        );
        tokenFactory.setDeployer(address(escrow));

        resolver = new ManualConditionResolver(owner);
        cond1 = abi.encode(keccak256("cond-1"));

        // Pick vector used by every test.
        picks.push(
            IV2Types.Pick({
                conditionResolver: address(resolver),
                conditionId: cond1,
                predictedOutcome: IV2Types.OutcomeSide.YES
            })
        );

        sponsor = new OnboardingSponsorV2(address(wUSDe), owner);
        sponsor.setBudgetManager(budgetManager);

        // Executor is deployed last; the auxiliary contracts store it as
        // `executor` immutable — so we compute its address first.
        address execAddress = vm.computeCreateAddress(
            address(this), vm.getNonce(address(this)) + 3
        );

        preMint = new PreMintEscrow(address(wUSDe), execAddress);
        cpVault = new CounterpartyVault(address(wUSDe), execAddress);
        pool = new InsurancePool(address(wUSDe), execAddress);

        exec = new CommittedIntentExecutor(
            address(wUSDe),
            address(preMint),
            address(cpVault),
            address(pool),
            address(escrow),
            address(sponsor)
        );
        require(address(exec) == execAddress, "nonce mismatch");

        // PreMintEscrow is the ONLY caller of sponsor.reserve/release/spend
        // — gate the sponsor at the escrow level.
        sponsor.setTrustedCaller(address(preMint));
        escrow.setTrustedMintRouter(address(exec));
    }

    // ============ Helpers ============

    function _fund(address who, uint256 amount) internal {
        wUSDe.mint(who, amount);
    }

    function _approveAll() internal {
        vm.prank(predictor);
        wUSDe.approve(address(preMint), type(uint256).max);
        vm.prank(cpA);
        wUSDe.approve(address(cpVault), type(uint256).max);
        vm.prank(cpB);
        wUSDe.approve(address(cpVault), type(uint256).max);
        vm.prank(cpC);
        wUSDe.approve(address(cpVault), type(uint256).max);
    }

    function _nextNonce() internal returns (uint256) {
        return _nonceCursor++;
    }

    function _pickConfigId() internal view returns (bytes32) {
        IV2Types.Pick[] memory arr = new IV2Types.Pick[](picks.length);
        for (uint256 i = 0; i < picks.length; i++) {
            arr[i] = picks[i];
        }
        return keccak256(abi.encode(arr));
    }

    function _buildCommitment()
        internal
        view
        returns (ICommittedIntent.Commitment memory c)
    {
        c.predictor = predictor;
        c.predictorWindowEnd = uint64(block.timestamp + 10);
        c.deadline = uint64(block.timestamp + 100);
        c.pickConfigId = _pickConfigId();
        c.amountIn = COMMON_AMOUNT_IN;
        c.minFillIn = COMMON_MIN_FILL_IN;
        c.minAmountOut = COMMON_MIN_AMOUNT_OUT;
        c.executorTip = COMMON_EXECUTOR_TIP;
    }

    function _signCommitment(ICommittedIntent.Commitment memory c, uint256 pk)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = _commitmentHashOffChain(c);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _commitmentHashOffChain(ICommittedIntent.Commitment memory c)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                exec.COMMITMENT_TYPEHASH(),
                c.predictor,
                uint256(c.predictorWindowEnd),
                uint256(c.deadline),
                c.pickConfigId,
                c.amountIn,
                c.minFillIn,
                c.minAmountOut,
                c.executorTip,
                c.nonce
            )
        );
        return keccak256(
            abi.encodePacked(
                bytes2(0x1901), exec.DOMAIN_SEPARATOR(), structHash
            )
        );
    }

    function _signQuote(ICommittedIntent.Quote memory q, uint256 pk)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                exec.QUOTE_TYPEHASH(),
                q.counterparty,
                uint256(q.deadline),
                q.commitmentHash,
                q.maxIn,
                q.amountOut,
                q.nonce
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked(
                bytes2(0x1901), exec.DOMAIN_SEPARATOR(), structHash
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _getCurrentPicks()
        internal
        view
        returns (IV2Types.Pick[] memory arr)
    {
        arr = new IV2Types.Pick[](picks.length);
        for (uint256 i = 0; i < picks.length; i++) {
            arr[i] = picks[i];
        }
    }

    function _commitStandard(
        ICommittedIntent.Commitment memory c,
        uint256 walletFund
    ) internal {
        _fund(predictor, walletFund);
        vm.prank(predictor);
        wUSDe.approve(address(preMint), type(uint256).max);
        bytes memory sig = _signCommitment(c, predictorPk);
        vm.prank(predictor);
        exec.commit(c, sig);
    }

    // ============ Sanity: contracts wired ============

    function test_setup_wiredProperly() public view {
        assertEq(address(exec.preMintEscrow()), address(preMint));
        assertEq(address(exec.counterpartyVault()), address(cpVault));
        assertEq(address(exec.insurancePool()), address(pool));
        assertEq(address(exec.predictionEscrow()), address(escrow));
        assertEq(address(exec.sponsor()), address(sponsor));
        assertEq(escrow.trustedMintRouter(), address(exec));
        assertEq(sponsor.trustedCaller(), address(preMint));
    }

    // ============ 6.1 Single counterparty, clean fill ============

    function test_example_6_1_singleCounterpartyCleanFill() public {
        // Setup
        _approveAll();
        ICommittedIntent.Commitment memory c = _buildCommitment();
        c.nonce = _nextNonce();
        _commitStandard(c, c.amountIn);

        // CP A quote: (100, 200). Vault=50, wallet=200.
        _fund(cpA, 200e18);
        vm.prank(cpA);
        cpVault.deposit(50e18);

        bytes32 cHash = exec.commitmentHash(c);
        ICommittedIntent.Quote memory q;
        q.counterparty = cpA;
        q.deadline = c.deadline;
        q.commitmentHash = cHash;
        q.maxIn = 100e18;
        q.amountOut = 200e18;
        q.nonce = 1;

        ICommittedIntent.Quote[] memory quotes = new ICommittedIntent.Quote[](1);
        quotes[0] = q;
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = _signQuote(q, cpAPk);

        // T₂: predictorCall = false, tip 0 (c.executorTip=0).
        vm.warp(c.predictorWindowEnd + 1);
        vm.prank(tipRecipient);
        exec.execute(
            c,
            _signCommitment(c, predictorPk),
            _getCurrentPicks(),
            quotes,
            sigs,
            tipRecipient
        );

        // Balances:
        // Predictor contributed 100; CP A contributed 200 from wallet.
        // Escrow holds 300 collateral.
        assertEq(wUSDe.balanceOf(address(escrow)), 300e18, "escrow balance");
        // Token mints: 300 of each side for the bilateral mint.
        IV2Types.TokenPair memory pair = escrow.getTokenPair(c.pickConfigId);
        assertEq(
            IPredictionMarketToken(pair.predictorToken).balanceOf(predictor),
            300e18,
            "predictor tokens"
        );
        assertEq(
            IPredictionMarketToken(pair.counterpartyToken).balanceOf(cpA),
            300e18,
            "CP A tokens"
        );
    }

    // ============ 6.2 Two counterparties, partial fill (full fill at 100) ============

    function test_example_6_2_twoCounterpartiesFullFill() public {
        _approveAll();
        ICommittedIntent.Commitment memory c = _buildCommitment();
        c.nonce = _nextNonce();
        _commitStandard(c, c.amountIn);

        _fund(cpA, 200e18);
        _fund(cpB, 200e18);

        bytes32 cHash = exec.commitmentHash(c);

        ICommittedIntent.Quote[] memory quotes = new ICommittedIntent.Quote[](2);
        quotes[0] = ICommittedIntent.Quote({
            counterparty: cpA,
            deadline: c.deadline,
            commitmentHash: cHash,
            maxIn: 60e18,
            amountOut: 130e18,
            nonce: 1
        });
        quotes[1] = ICommittedIntent.Quote({
            counterparty: cpB,
            deadline: c.deadline,
            commitmentHash: cHash,
            maxIn: 80e18,
            amountOut: 160e18,
            nonce: 2
        });
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _signQuote(quotes[0], cpAPk);
        sigs[1] = _signQuote(quotes[1], cpBPk);

        vm.warp(c.predictorWindowEnd + 1);
        exec.execute(
            c,
            _signCommitment(c, predictorPk),
            _getCurrentPicks(),
            quotes,
            sigs,
            tipRecipient
        );

        // Slice A: 60 in, 130 out → 190 total.
        // Slice B: 40 in, 80 out  → 120 total. (80 * 40/80 = 40 → but slice_out = take * amountOut/maxIn = 40*160/80 = 80).
        // Predictor: 190 + 120 = 310 tokens total.
        IV2Types.TokenPair memory pair = escrow.getTokenPair(c.pickConfigId);
        assertEq(
            IPredictionMarketToken(pair.predictorToken).balanceOf(predictor),
            310e18,
            "predictor tokens"
        );
        assertEq(
            IPredictionMarketToken(pair.counterpartyToken).balanceOf(cpA),
            190e18
        );
        assertEq(
            IPredictionMarketToken(pair.counterpartyToken).balanceOf(cpB),
            120e18
        );
        assertEq(wUSDe.balanceOf(address(escrow)), 310e18, "escrow balance");
    }

    // ============ 6.3 Partial fill with refund ============

    function test_example_6_3_partialFillWithRefund() public {
        _approveAll();
        ICommittedIntent.Commitment memory c = _buildCommitment();
        c.nonce = _nextNonce();
        _commitStandard(c, c.amountIn);
        uint256 predBalAfterCommit = wUSDe.balanceOf(predictor);
        assertEq(predBalAfterCommit, 0, "predictor wallet drained at commit");

        _fund(cpA, 200e18);

        bytes32 cHash = exec.commitmentHash(c);
        ICommittedIntent.Quote[] memory quotes = new ICommittedIntent.Quote[](1);
        quotes[0] = ICommittedIntent.Quote({
            counterparty: cpA,
            deadline: c.deadline,
            commitmentHash: cHash,
            maxIn: 70e18,
            amountOut: 160e18,
            nonce: 1
        });
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = _signQuote(quotes[0], cpAPk);

        vm.warp(c.predictorWindowEnd + 1);
        exec.execute(
            c,
            _signCommitment(c, predictorPk),
            _getCurrentPicks(),
            quotes,
            sigs,
            tipRecipient
        );

        // filledIn = 70, aggregateOut = 160 → mint 230 total.
        IV2Types.TokenPair memory pair = escrow.getTokenPair(c.pickConfigId);
        assertEq(
            IPredictionMarketToken(pair.predictorToken).balanceOf(predictor),
            230e18
        );
        assertEq(
            IPredictionMarketToken(pair.counterpartyToken).balanceOf(cpA),
            230e18
        );
        assertEq(wUSDe.balanceOf(address(escrow)), 230e18, "escrow balance");

        // Predictor has 30 credit in pre-mint escrow (unfilled).
        assertEq(preMint.creditOf(predictor), 30e18, "predictor credit");

        // Withdraw credit to wallet.
        vm.prank(predictor);
        preMint.withdrawCredit(predictor, 30e18);
        assertEq(wUSDe.balanceOf(predictor), 30e18, "predictor wallet refund");
    }

    // ============ 6.4 CP fails, fallback succeeds — make-whole fully covered ============

    function test_example_6_4_failThenFallbackMakeWhole() public {
        _approveAll();
        ICommittedIntent.Commitment memory c = _buildCommitment();
        c.nonce = _nextNonce();
        _commitStandard(c, c.amountIn);

        // CP A wallet = 0 to force full shortfall (covers the example's
        // "wallet short" case more cleanly). Vault = 30.
        _fund(cpA, 0);
        // Pre-deposit vault via another party to avoid wallet allowance:
        _fund(address(this), 30e18);
        wUSDe.approve(address(cpVault), 30e18);
        // Deposit into CP A's vault balance on their behalf by pranking cpA
        // after funding cpA → but we want wallet = 0 at slice time. Mint to
        // cpA, approve, deposit to vault, then zero wallet.
        _fund(cpA, 30e18);
        vm.prank(cpA);
        wUSDe.approve(address(cpVault), type(uint256).max);
        vm.prank(cpA);
        cpVault.deposit(30e18);
        // wallet is now 0.
        assertEq(wUSDe.balanceOf(cpA), 0);

        _fund(cpB, 200e18);

        bytes32 cHash = exec.commitmentHash(c);
        ICommittedIntent.Quote[] memory quotes = new ICommittedIntent.Quote[](2);
        quotes[0] = ICommittedIntent.Quote({
            counterparty: cpA,
            deadline: c.deadline,
            commitmentHash: cHash,
            maxIn: 100e18,
            amountOut: 200e18,
            nonce: 1
        });
        quotes[1] = ICommittedIntent.Quote({
            counterparty: cpB,
            deadline: c.deadline,
            commitmentHash: cHash,
            maxIn: 100e18,
            amountOut: 170e18,
            nonce: 2
        });
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _signQuote(quotes[0], cpAPk);
        sigs[1] = _signQuote(quotes[1], cpBPk);

        vm.warp(c.predictorWindowEnd + 1);
        exec.execute(
            c,
            _signCommitment(c, predictorPk),
            _getCurrentPicks(),
            quotes,
            sigs,
            tipRecipient
        );

        // Total collateral = 100 + 170 + 30 = 300.
        IV2Types.TokenPair memory pair = escrow.getTokenPair(c.pickConfigId);
        assertEq(
            IPredictionMarketToken(pair.predictorToken).balanceOf(predictor),
            300e18,
            "predictor tokens"
        );
        assertEq(
            IPredictionMarketToken(pair.counterpartyToken).balanceOf(cpB),
            300e18,
            "CP B tokens"
        );
        assertEq(
            IPredictionMarketToken(pair.counterpartyToken).balanceOf(cpA),
            0,
            "CP A has none"
        );
        assertEq(cpVault.balanceOf(cpA), 0, "CP A slashed");
        assertEq(pool.balance(), 0, "pool stays empty");
    }

    // ============ 6.5 CP fails, vault short, InsurancePool tops up ============

    function test_example_6_5_insurancePoolTopsUp() public {
        _approveAll();
        ICommittedIntent.Commitment memory c = _buildCommitment();
        c.nonce = _nextNonce();
        _commitStandard(c, c.amountIn);

        // Pool preload: 15.
        _fund(address(this), 15e18);
        // Contribute via another actor: pool.contribute(hash, cp, amount)
        // pulls from msg.sender. We act as ourselves.
        wUSDe.approve(address(pool), 15e18);
        pool.contribute(bytes32(0), address(this), 15e18);

        // CP A wallet=0, vault=10.
        _fund(cpA, 10e18);
        vm.prank(cpA);
        wUSDe.approve(address(cpVault), type(uint256).max);
        vm.prank(cpA);
        cpVault.deposit(10e18);
        assertEq(wUSDe.balanceOf(cpA), 0);

        _fund(cpB, 200e18);

        bytes32 cHash = exec.commitmentHash(c);
        ICommittedIntent.Quote[] memory quotes = new ICommittedIntent.Quote[](2);
        quotes[0] = ICommittedIntent.Quote({
            counterparty: cpA,
            deadline: c.deadline,
            commitmentHash: cHash,
            maxIn: 100e18,
            amountOut: 200e18,
            nonce: 1
        });
        quotes[1] = ICommittedIntent.Quote({
            counterparty: cpB,
            deadline: c.deadline,
            commitmentHash: cHash,
            maxIn: 100e18,
            amountOut: 170e18,
            nonce: 2
        });
        bytes[] memory sigs = new bytes[](2);
        sigs[0] = _signQuote(quotes[0], cpAPk);
        sigs[1] = _signQuote(quotes[1], cpBPk);

        vm.warp(c.predictorWindowEnd + 1);
        exec.execute(
            c,
            _signCommitment(c, predictorPk),
            _getCurrentPicks(),
            quotes,
            sigs,
            tipRecipient
        );

        // Total collateral = 100 + 170 + 10 + 15 = 295.
        IV2Types.TokenPair memory pair = escrow.getTokenPair(c.pickConfigId);
        assertEq(
            IPredictionMarketToken(pair.predictorToken).balanceOf(predictor),
            295e18,
            "predictor tokens"
        );
        assertEq(
            IPredictionMarketToken(pair.counterpartyToken).balanceOf(cpB),
            295e18
        );
        assertEq(cpVault.balanceOf(cpA), 0, "CP A slashed");
        assertEq(pool.balance(), 0, "pool drained");
    }

    // ============ 6.6 Single CP fails, no fallback — slash only, no mint ============

    function test_example_6_6_slashOnlyNoMint_thenRetry() public {
        _approveAll();
        ICommittedIntent.Commitment memory c = _buildCommitment();
        c.nonce = _nextNonce();
        _commitStandard(c, c.amountIn);

        _fund(cpA, 40e18);
        vm.prank(cpA);
        wUSDe.approve(address(cpVault), type(uint256).max);
        vm.prank(cpA);
        cpVault.deposit(40e18);
        assertEq(wUSDe.balanceOf(cpA), 0);

        bytes32 cHash = exec.commitmentHash(c);
        ICommittedIntent.Quote[] memory quotes = new ICommittedIntent.Quote[](1);
        quotes[0] = ICommittedIntent.Quote({
            counterparty: cpA,
            deadline: c.deadline,
            commitmentHash: cHash,
            maxIn: 100e18,
            amountOut: 200e18,
            nonce: 1
        });
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = _signQuote(quotes[0], cpAPk);

        vm.warp(c.predictorWindowEnd + 1);
        // T₂ call, no revert, slash happens, no mint.
        exec.execute(
            c,
            _signCommitment(c, predictorPk),
            _getCurrentPicks(),
            quotes,
            sigs,
            tipRecipient
        );

        // InsurancePool received 40; CP A drained; commitment NOT settled.
        assertEq(pool.balance(), 40e18, "pool got slash");
        assertEq(cpVault.balanceOf(cpA), 0, "CP A drained");
        assertFalse(exec.settled(cHash), "commitment stays alive");

        // Retry with CP C later.
        _fund(cpC, 200e18);

        ICommittedIntent.Quote[] memory q2 = new ICommittedIntent.Quote[](1);
        q2[0] = ICommittedIntent.Quote({
            counterparty: cpC,
            deadline: c.deadline,
            commitmentHash: cHash,
            maxIn: 100e18,
            amountOut: 180e18,
            nonce: 1
        });
        bytes[] memory s2 = new bytes[](1);
        s2[0] = _signQuote(q2[0], cpCPk);

        exec.execute(
            c,
            _signCommitment(c, predictorPk),
            _getCurrentPicks(),
            q2,
            s2,
            tipRecipient
        );

        IV2Types.TokenPair memory pair = escrow.getTokenPair(c.pickConfigId);
        assertEq(
            IPredictionMarketToken(pair.predictorToken).balanceOf(predictor),
            280e18
        );
        assertEq(
            IPredictionMarketToken(pair.counterpartyToken).balanceOf(cpC),
            280e18
        );
        assertTrue(exec.settled(cHash), "settled after retry");
    }

    // ============ 6.7 Sponsored predictor, full fill ============

    function test_example_6_7_sponsoredFullFill() public {
        _approveAll();
        // Allocate 70e18 to predictor, fund the sponsor contract, predictor
        // wallet has 30 (plus 0 for tip since executorTip = 0).
        vm.prank(budgetManager);
        sponsor.setAllocation(predictor, 70e18);
        _fund(address(sponsor), 70e18);
        _fund(predictor, 30e18);

        ICommittedIntent.Commitment memory c = _buildCommitment();
        c.nonce = _nextNonce();
        bytes memory sig = _signCommitment(c, predictorPk);
        vm.prank(predictor);
        exec.commit(c, sig);

        // Sponsor reserved 70, wallet pulled 30 → pre-mint holds 30, sponsor
        // has 70 marked reserved.
        assertEq(wUSDe.balanceOf(predictor), 0);
        assertEq(sponsor.reserved(predictor), 70e18);

        _fund(cpA, 200e18);

        bytes32 cHash = exec.commitmentHash(c);
        ICommittedIntent.Quote[] memory quotes = new ICommittedIntent.Quote[](1);
        quotes[0] = ICommittedIntent.Quote({
            counterparty: cpA,
            deadline: c.deadline,
            commitmentHash: cHash,
            maxIn: 100e18,
            amountOut: 180e18,
            nonce: 1
        });
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = _signQuote(quotes[0], cpAPk);

        vm.warp(c.predictorWindowEnd + 1);
        exec.execute(
            c,
            _signCommitment(c, predictorPk),
            _getCurrentPicks(),
            quotes,
            sigs,
            tipRecipient
        );

        // Mint totalCollateral = 100 + 180 = 280.
        IV2Types.TokenPair memory pair = escrow.getTokenPair(c.pickConfigId);
        assertEq(
            IPredictionMarketToken(pair.predictorToken).balanceOf(predictor),
            280e18
        );
        assertEq(
            IPredictionMarketToken(pair.counterpartyToken).balanceOf(cpA),
            280e18
        );
        // Sponsor should have 70 spent, 0 reserved (full consume).
        assertEq(sponsor.spent(predictor), 70e18, "sponsor spent");
        assertEq(sponsor.reserved(predictor), 0, "sponsor reservation cleared");
    }

    // ============ 6.8 Sponsored predictor, partial fill ============

    function test_example_6_8_sponsoredPartialFill() public {
        _approveAll();
        vm.prank(budgetManager);
        sponsor.setAllocation(predictor, 70e18);
        _fund(address(sponsor), 70e18);
        _fund(predictor, 30e18);

        ICommittedIntent.Commitment memory c = _buildCommitment();
        // PRD 6.8 implicitly expects the mint to succeed with aggregateOut
        // 120 on the filled 60. Lower the floor to match the example intent
        // (minAmountOut scales with filled size, not the full amountIn).
        c.minAmountOut = 120e18;
        c.nonce = _nextNonce();
        bytes memory sig = _signCommitment(c, predictorPk);
        vm.prank(predictor);
        exec.commit(c, sig);

        _fund(cpA, 200e18);

        bytes32 cHash = exec.commitmentHash(c);
        ICommittedIntent.Quote[] memory quotes = new ICommittedIntent.Quote[](1);
        quotes[0] = ICommittedIntent.Quote({
            counterparty: cpA,
            deadline: c.deadline,
            commitmentHash: cHash,
            maxIn: 60e18,
            amountOut: 120e18,
            nonce: 1
        });
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = _signQuote(quotes[0], cpAPk);

        vm.warp(c.predictorWindowEnd + 1);
        exec.execute(
            c,
            _signCommitment(c, predictorPk),
            _getCurrentPicks(),
            quotes,
            sigs,
            tipRecipient
        );

        // Slice: 60 in, 120 out → mint 180.
        IV2Types.TokenPair memory pair = escrow.getTokenPair(c.pickConfigId);
        assertEq(
            IPredictionMarketToken(pair.predictorToken).balanceOf(predictor),
            180e18
        );
        assertEq(
            IPredictionMarketToken(pair.counterpartyToken).balanceOf(cpA),
            180e18
        );

        // Sponsor consumed 60 (sponsor-first on filled); 10 released back.
        assertEq(sponsor.spent(predictor), 60e18, "sponsor spent 60");
        assertEq(sponsor.reserved(predictor), 0, "reservation cleared");

        // Predictor wallet credit = 30 (unspent walletUse).
        assertEq(preMint.creditOf(predictor), 30e18, "wallet credit = 30");
    }
}
