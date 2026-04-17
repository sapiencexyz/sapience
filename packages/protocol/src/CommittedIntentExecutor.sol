// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import { ICommittedIntent } from "./interfaces/ICommittedIntent.sol";
import { IPreMintEscrow } from "./interfaces/IPreMintEscrow.sol";
import { ICounterpartyVault } from "./interfaces/ICounterpartyVault.sol";
import { IInsurancePool } from "./interfaces/IInsurancePool.sol";
import { IV2Types } from "./interfaces/IV2Types.sol";
import {
    IPredictionMarketEscrow
} from "./interfaces/IPredictionMarketEscrow.sol";
import { OnboardingSponsorV2 } from "./sponsors/OnboardingSponsorV2.sol";

/**
 * @title CommittedIntentExecutor
 * @notice Canonical executor for the Committed-Intent flow.
 * @dev Implementation follows prd-001-spec-0.1-canonical.md §1.9 literally:
 *      slash-all-failures, bonusCarry forward, silent-in-T₂ / loud-in-T₁,
 *      bilateral mints via PredictionMarketEscrow.mint() as trusted router.
 *
 *   Responsibilities:
 *     - commit(c, sig): validate predictor sig, consume nonce, pull amountIn
 *       + executorTip into PreMintEscrow sponsor-first-then-wallet.
 *     - execute(...): walk quotes best-price-first, per-slice bilateral mint
 *       through the trusted-router path on PredictionMarketEscrow, slashing
 *       failing counterparties and carrying bonus collateral forward. Settles
 *       on success; silent no-op in T₂ when floors fail (commitment stays alive).
 *     - expire(c, sig): after deadline, release the escrow back to predictor
 *       (credit + sponsor release).
 *
 *   NOT responsible for:
 *     - Mirror / quote distribution (relayer-side).
 *     - Per-counterparty exposure accounting (relayer-side).
 *     - Condition resolution (lives in PredictionMarketEscrow / resolvers).
 */
contract CommittedIntentExecutor is ICommittedIntent, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ EIP-712 ============

    /// @dev keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    /// @dev keccak256("SapienceCommittedIntent")
    bytes32 internal constant DOMAIN_NAME_HASH =
        keccak256("SapienceCommittedIntent");

    /// @dev keccak256("1")
    bytes32 internal constant DOMAIN_VERSION_HASH = keccak256("1");

    bytes32 public constant COMMITMENT_TYPEHASH = keccak256(
        "Commitment(address predictor,uint64 predictorWindowEnd,uint64 deadline,bytes32 pickConfigId,uint256 amountIn,uint256 minFillIn,uint256 minAmountOut,uint256 executorTip,uint256 nonce)"
    );

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(address counterparty,uint64 deadline,bytes32 commitmentHash,uint256 maxIn,uint256 amountOut,uint256 nonce)"
    );

    // ============ Immutables ============

    IERC20 public immutable collateralToken;
    IPreMintEscrow public immutable preMintEscrow;
    ICounterpartyVault public immutable counterpartyVault;
    IInsurancePool public immutable insurancePool;
    IPredictionMarketEscrow public immutable predictionEscrow;
    OnboardingSponsorV2 public immutable sponsor;
    bytes32 private immutable _domainSeparator;
    uint256 private immutable _cachedChainId;

    // ============ Storage ============

    /// @notice Whether a commitment has been fully settled (mint + refund).
    mapping(bytes32 commitmentHash => bool) public settled;

    /// @notice Replay protection for individual quote hashes (consumed once).
    mapping(bytes32 quoteHash_ => bool) public usedQuoteHash;

    /// @notice Permit2-style bitmap nonces (independent of the Escrow's bitmap).
    mapping(address => mapping(uint256 => uint256)) private _nonceBitmap;

    /// @notice ERC-1271 magic value.
    bytes4 internal constant ERC1271_MAGIC_VALUE = 0x1626ba7e;

    /// @notice Gas budget for ERC-1271 `isValidSignature` calls.
    uint256 internal constant EIP1271_GAS_LIMIT = 500_000;

    // ============ Constructor ============

    constructor(
        address collateralToken_,
        address preMintEscrow_,
        address counterpartyVault_,
        address insurancePool_,
        address predictionEscrow_,
        address sponsor_
    ) {
        collateralToken = IERC20(collateralToken_);
        preMintEscrow = IPreMintEscrow(preMintEscrow_);
        counterpartyVault = ICounterpartyVault(counterpartyVault_);
        insurancePool = IInsurancePool(insurancePool_);
        predictionEscrow = IPredictionMarketEscrow(predictionEscrow_);
        sponsor = OnboardingSponsorV2(sponsor_);

        _cachedChainId = block.chainid;
        _domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                DOMAIN_NAME_HASH,
                DOMAIN_VERSION_HASH,
                block.chainid,
                address(this)
            )
        );

        // Pre-approve the prediction escrow to pull collateral the executor
        // holds during the walk (insurance draws, slashed make-whole, etc.).
        IERC20(collateralToken_)
            .forceApprove(predictionEscrow_, type(uint256).max);
        IERC20(collateralToken_).forceApprove(insurancePool_, type(uint256).max);
    }

    // ============ Public getters ============

    /// @inheritdoc ICommittedIntent
    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        if (block.chainid == _cachedChainId) return _domainSeparator;
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                DOMAIN_NAME_HASH,
                DOMAIN_VERSION_HASH,
                block.chainid,
                address(this)
            )
        );
    }

    /// @inheritdoc ICommittedIntent
    function commitmentHash(Commitment calldata c)
        public
        view
        returns (bytes32)
    {
        return _commitmentHash(c);
    }

    /// @inheritdoc ICommittedIntent
    function quoteHash(Quote calldata q) public view returns (bytes32) {
        return _quoteHash(q);
    }

    /// @notice View wrapper for off-chain nonce inspection.
    function isNonceUsed(address account, uint256 nonce)
        external
        view
        returns (bool)
    {
        uint256 wordPos = nonce >> 8;
        uint256 bitPos = nonce & 0xff;
        return (_nonceBitmap[account][wordPos] & (1 << bitPos)) != 0;
    }

    // ============ commit ============

    /// @inheritdoc ICommittedIntent
    function commit(Commitment calldata c, bytes calldata predictorSig)
        external
        nonReentrant
    {
        if (block.timestamp > c.deadline) revert CI_Expired();
        if (c.predictorWindowEnd > c.deadline) revert CI_InvalidWindow();

        bytes32 cHash = _commitmentHash(c);
        if (settled[cHash]) revert CI_AlreadySettled();

        if (!_validateSignature(cHash, c.predictor, predictorSig)) {
            revert CI_InvalidPredictorSig();
        }

        _useNonce(c.predictor, c.nonce);

        // Sponsor-first split — sponsor only covers `amountIn`, NOT the tip.
        uint256 sponsorUse = sponsor.availableFor(c.predictor) >= c.amountIn
            ? c.amountIn
            : sponsor.availableFor(c.predictor);
        uint256 walletUse = c.amountIn - sponsorUse;

        // Pull collateral into pre-mint escrow (which also reserves sponsor).
        // Executor tip is pulled from the wallet side, not sponsored.
        // Approve the escrow to pull from the predictor via this contract: we
        // pass through `predictorSig`-less (the predictor's own ERC-20
        // allowance to the escrow is used). The PreMintEscrow pulls directly
        // from the predictor's wallet for walletUse + executorTip.
        preMintEscrow.lock(
            cHash,
            c.predictor,
            c.amountIn,
            c.executorTip,
            sponsorUse,
            walletUse,
            address(sponsor),
            ""
        );

        emit CommitmentCreated(
            cHash,
            c.predictor,
            c.pickConfigId,
            c.amountIn,
            c.minFillIn,
            c.minAmountOut,
            c.predictorWindowEnd,
            c.deadline,
            c.executorTip,
            c.nonce,
            sponsorUse,
            walletUse
        );
    }

    // ============ execute ============

    /// @dev Scratchpad for the walk to tame stack-too-deep.
    struct ExecState {
        bytes32 cHash;
        uint256 remaining;
        uint256 aggregateOut;
        uint256 bonusCarry;
        uint256 filledSlices;
    }

    /// @inheritdoc ICommittedIntent
    function execute(
        Commitment calldata c,
        bytes calldata predictorSig,
        IV2Types.Pick[] calldata picks,
        Quote[] calldata quotes,
        bytes[] calldata counterpartySigs,
        address tipRecipient
    ) external nonReentrant {
        if (block.timestamp > c.deadline) {
            revert CI_Expired();
        }

        bytes32 cHash = _commitmentHash(c);
        if (settled[cHash]) revert CI_AlreadySettled();
        if (quotes.length != counterpartySigs.length) {
            revert CI_InvalidCounterpartySig(0);
        }

        // Re-validate the predictor sig (independent of commit-time state,
        // so a stale sig that was used to commit cannot be spoofed here).
        if (!_validateSignature(cHash, c.predictor, predictorSig)) {
            revert CI_InvalidPredictorSig();
        }

        // T₁ gate.
        bool predictorCall = (msg.sender == c.predictor);
        if (block.timestamp <= c.predictorWindowEnd && !predictorCall) {
            revert CI_NotPredictor();
        }

        // picks ↔ pickConfigId
        if (_computePickConfigId(picks) != c.pickConfigId) {
            revert CI_PicksMismatch();
        }

        ExecState memory s = ExecState({
            cHash: cHash,
            remaining: c.amountIn,
            aggregateOut: 0,
            bonusCarry: 0,
            filledSlices: 0
        });

        _walk(c, picks, quotes, counterpartySigs, s);

        _finalize(c, s, predictorCall, tipRecipient);
    }

    function _finalize(
        Commitment calldata c,
        ExecState memory s,
        bool predictorCall,
        address tipRecipient
    ) internal {
        uint256 filledIn = c.amountIn - s.remaining;

        // Post-walk floor decision.
        if (filledIn < c.minFillIn || s.aggregateOut < c.minAmountOut) {
            if (predictorCall) {
                // Loud revert in T₁ gives the predictor UX feedback.
                if (filledIn < c.minFillIn) {
                    revert CI_BelowMinFillIn(filledIn, c.minFillIn);
                }
                revert CI_BelowMinAmountOut(s.aggregateOut, c.minAmountOut);
            }
            // T₂ silent no-mint stay-alive: persist slashing, no settle.
            emit Executed(s.cHash, msg.sender, 0, 0, 0, 0);
            return;
        }

        // Success path: settle the escrow deposit.
        uint256 tipPaid = predictorCall ? 0 : c.executorTip;
        address effectiveTipRecipient =
            tipRecipient == address(0) ? msg.sender : tipRecipient;

        preMintEscrow.settle(
            s.cHash,
            filledIn,
            address(predictionEscrow),
            tipPaid,
            effectiveTipRecipient
        );
        settled[s.cHash] = true;

        emit Executed(
            s.cHash,
            msg.sender,
            filledIn,
            s.aggregateOut,
            c.amountIn - filledIn,
            tipPaid
        );
    }

    /// @dev Core walk + slash-all-failures ladder. Kept separate to avoid
    ///      stack-too-deep in `execute`.
    function _walk(
        Commitment calldata c,
        IV2Types.Pick[] calldata picks,
        Quote[] calldata quotes,
        bytes[] calldata counterpartySigs,
        ExecState memory s
    ) internal {
        uint256 n = quotes.length;
        for (uint256 i = 0; i < n; i++) {
            if (s.remaining == 0 && s.bonusCarry == 0) break;

            Quote calldata q = quotes[i];

            // Monotonicity cross-multiply check (aggregate best-price-first).
            if (i > 0) {
                Quote calldata prev = quotes[i - 1];
                if (prev.amountOut * q.maxIn < q.amountOut * prev.maxIn) {
                    revert CI_NonMonotonicQuotes(i);
                }
            }

            _validateQuote(q, counterpartySigs[i], s.cHash, i);

            if (s.remaining == 0) {
                // bonusCarry left over from a tail slash with no slice to
                // attach it to. Unusual — skip the rest of the walk; carry
                // gets surfaced via settle refund (stays with escrow sink).
                break;
            }

            uint256 take = q.maxIn < s.remaining ? q.maxIn : s.remaining;
            uint256 sliceOut = (take * q.amountOut) / q.maxIn;

            uint256 pulled = counterpartyVault.pullOut(
                q.counterparty, sliceOut, address(predictionEscrow)
            );

            if (pulled < sliceOut) {
                // Slash-all-failures (S-2).
                _handleCounterpartyFailure(q, quotes, i, s);
                continue;
            }

            // Successful slice: bilateral mint via trusted router.
            bytes32 predictionId =
                _mintSlice(c, picks, q, take, sliceOut, s.bonusCarry);

            emit SliceFilled(
                s.cHash,
                i,
                _quoteHash(q),
                q.counterparty,
                take,
                sliceOut,
                s.bonusCarry,
                predictionId
            );

            s.bonusCarry = 0;
            s.remaining -= take;
            s.aggregateOut += sliceOut;
            s.filledSlices++;
        }
    }

    function _handleCounterpartyFailure(
        Quote calldata q,
        Quote[] calldata quotes,
        uint256 i,
        ExecState memory s
    ) internal {
        // Vault goes directly to this executor so we can partition it.
        uint256 drained =
            counterpartyVault.slashTotal(q.counterparty, address(this));

        bool hasNext = (i + 1) < quotes.length;
        uint256 makeWhole;
        uint256 poolContribution;
        uint256 poolDraw;

        if (hasNext) {
            Quote calldata next = quotes[i + 1];
            uint256 delta =
                q.amountOut > next.amountOut ? q.amountOut - next.amountOut : 0;

            makeWhole = drained < delta ? drained : delta;
            uint256 excess = drained - makeWhole;

            if (makeWhole < delta) {
                poolDraw = insurancePool.drawFor(
                    s.cHash, address(this), delta - makeWhole
                );
            }
            if (excess > 0) {
                insurancePool.contribute(s.cHash, q.counterparty, excess);
                poolContribution = excess;
            }
            s.bonusCarry += makeWhole + poolDraw;
        } else {
            // Tail slash: no fallback → entire drained goes to pool.
            if (drained > 0) {
                insurancePool.contribute(s.cHash, q.counterparty, drained);
            }
            poolContribution = drained;
        }

        emit CounterpartySlashed(
            s.cHash,
            q.counterparty,
            drained,
            makeWhole,
            poolContribution,
            poolDraw
        );
        if (poolContribution > 0) {
            emit InsurancePoolFunded(s.cHash, q.counterparty, poolContribution);
        }
        if (poolDraw > 0) {
            emit InsurancePoolDrawn(s.cHash, poolDraw);
        }
    }

    /// @dev Build the MintRequest for a single filled slice and call the
    ///      trusted-router path on PredictionMarketEscrow.
    function _mintSlice(
        Commitment calldata c,
        IV2Types.Pick[] calldata picks,
        Quote calldata q,
        uint256 take,
        uint256 sliceOut,
        uint256 bonusCarry
    ) internal returns (bytes32 predictionId) {
        IV2Types.MintRequest memory req;
        req.picks = picks;
        req.predictorCollateral = take + bonusCarry;
        req.counterpartyCollateral = sliceOut;
        req.predictor = c.predictor;
        req.counterparty = q.counterparty;
        // Nonces: use unique per-slice values derived from commitment+quote
        // hashes (consumed exactly once each by the trusted-router path).
        req.predictorNonce = uint256(
            keccak256(
                abi.encode(
                    "CI_PREDICTOR_NONCE", _commitmentHash(c), q.counterparty
                )
            )
        );
        req.counterpartyNonce =
            uint256(keccak256(abi.encode("CI_CP_NONCE", _quoteHash(q))));
        req.predictorDeadline = c.deadline;
        req.counterpartyDeadline = q.deadline;
        // Signatures left empty — bypassed by trustedMintRouter path.
        // Sponsor fields also empty — collateral is already at the escrow.
        (predictionId,,) = predictionEscrow.mint(req);
    }

    // ============ expire ============

    /// @inheritdoc ICommittedIntent
    function expire(Commitment calldata c, bytes calldata predictorSig)
        external
        nonReentrant
    {
        if (block.timestamp <= c.deadline) {
            revert CI_NotYetExecutable();
        }

        bytes32 cHash = _commitmentHash(c);
        if (settled[cHash]) revert CI_AlreadySettled();

        if (!_validateSignature(cHash, c.predictor, predictorSig)) {
            revert CI_InvalidPredictorSig();
        }

        (uint256 walletRefund, uint256 sponsorRelease) =
            preMintEscrow.releaseAll(cHash);
        settled[cHash] = true;

        emit CommitmentExpired(cHash, msg.sender, walletRefund, sponsorRelease);
    }

    // ============ Internal: nonces ============

    function _useNonce(address account, uint256 nonce) internal {
        uint256 wordPos = nonce >> 8;
        uint256 bitPos = nonce & 0xff;
        uint256 bit = 1 << bitPos;
        uint256 word = _nonceBitmap[account][wordPos];
        if (word & bit != 0) revert CI_NonceAlreadyUsed();
        _nonceBitmap[account][wordPos] = word | bit;
    }

    // ============ Internal: quote validation ============

    function _validateQuote(
        Quote calldata q,
        bytes calldata sig,
        bytes32 cHash,
        uint256 i
    ) internal {
        if (q.commitmentHash != cHash) {
            revert CI_QuoteCommitmentMismatch(i);
        }
        if (block.timestamp > q.deadline) revert CI_QuoteExpired(i);

        bytes32 qHash = _quoteHash(q);
        if (usedQuoteHash[qHash]) revert CI_QuoteReused(i);
        usedQuoteHash[qHash] = true;

        if (!_validateSignature(qHash, q.counterparty, sig)) {
            revert CI_InvalidCounterpartySig(i);
        }
    }

    // ============ Internal: EIP-712 hashing ============

    function _commitmentHash(Commitment calldata c)
        internal
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                COMMITMENT_TYPEHASH,
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
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash)
        );
    }

    function _quoteHash(Quote calldata q) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                q.counterparty,
                uint256(q.deadline),
                q.commitmentHash,
                q.maxIn,
                q.amountOut,
                q.nonce
            )
        );
        return keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash)
        );
    }

    // ============ Internal: picks ============

    function _computePickConfigId(IV2Types.Pick[] calldata picks)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(picks));
    }

    // ============ Internal: signature validation ============

    /// @dev Minimal inline helper: ECDSA with ERC-1271 fallback. Ported from
    ///      `SignatureValidator._validateSignatureWithFallback`. No legacy
    ///      session-key branch, no smart-account owner derivation.
    function _validateSignature(
        bytes32 digest,
        address signer,
        bytes calldata sig
    ) internal view returns (bool) {
        // ECDSA first (cheap).
        (address recovered, ECDSA.RecoverError err,) =
            ECDSA.tryRecover(digest, sig);
        if (
            err == ECDSA.RecoverError.NoError && recovered != address(0)
                && recovered == signer
        ) {
            return true;
        }
        // Fallback to ERC-1271 for contracts.
        if (signer.code.length == 0) return false;
        try IERC1271(signer).isValidSignature{ gas: EIP1271_GAS_LIMIT }(
            digest, sig
        ) returns (
            bytes4 magic
        ) {
            return magic == ERC1271_MAGIC_VALUE;
        } catch {
            return false;
        }
    }
}
