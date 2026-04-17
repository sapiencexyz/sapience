// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IPreMintEscrow } from "./interfaces/IPreMintEscrow.sol";
import { OnboardingSponsorV2 } from "./sponsors/OnboardingSponsorV2.sol";

/**
 * @title PreMintEscrow
 * @notice Single-asset (WUSDe) holding pen for committed-intent deposits.
 * @dev See prd-001-decisions.md A-3 (separate contract, minimal storage).
 *      Only the executor may call `lock/settle/releaseAll`.
 */
contract PreMintEscrow is IPreMintEscrow, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Events ============

    event Locked(
        bytes32 indexed commitmentHash,
        address indexed predictor,
        uint256 amountIn,
        uint256 executorTip,
        uint256 sponsorUse,
        uint256 walletUse,
        address sponsor
    );
    event Settled(
        bytes32 indexed commitmentHash,
        uint256 filledIn,
        uint256 refundedWallet,
        uint256 releasedSponsor,
        uint256 tipPaid,
        address tipRecipient
    );
    event ReleasedAll(
        bytes32 indexed commitmentHash,
        uint256 refundedWallet,
        uint256 releasedSponsor
    );
    event CreditWithdrawn(address indexed predictor, uint256 amount);

    // ============ Errors ============

    error UnauthorizedExecutor();
    error CommitmentAlreadyLocked();
    error CommitmentNotLocked();
    error InsufficientCredit();
    error AmountSplitMismatch();
    error TipMismatch();

    // ============ Types ============

    struct Deposit {
        address predictor;
        address sponsor; // OnboardingSponsorV2 address or zero
        uint256 walletUse; // pulled from predictor wallet (excluding tip)
        uint256 sponsorUse; // reserved against sponsor
        uint256 executorTip; // walletUse-side extra, pulled from predictor wallet
    }

    // ============ Immutables ============

    IERC20 public immutable collateralToken;
    address public immutable executor;

    // ============ State ============

    mapping(bytes32 => Deposit) private _deposits;
    mapping(address => uint256) private _credit;

    // ============ Constructor ============

    constructor(address collateralToken_, address executor_) {
        collateralToken = IERC20(collateralToken_);
        executor = executor_;
    }

    // ============ Executor-only entrypoints ============

    /// @inheritdoc IPreMintEscrow
    function lock(
        bytes32 commitmentHash,
        address predictor,
        uint256 amountIn,
        uint256 executorTip,
        uint256 sponsorUse,
        uint256 walletUse,
        address predictorSponsor,
        bytes calldata predictorSponsorData
    ) external nonReentrant {
        if (msg.sender != executor) {
            revert UnauthorizedExecutor();
        }
        if (sponsorUse + walletUse != amountIn) revert AmountSplitMismatch();
        if (_deposits[commitmentHash].predictor != address(0)) {
            revert CommitmentAlreadyLocked();
        }

        // Cover walletUse from credit first, then pull the remainder from the
        // wallet. Executor tip is always pulled from the wallet (never sponsored).
        uint256 walletTotal = walletUse + executorTip;

        if (walletTotal > 0) {
            uint256 creditBalance = _credit[predictor];
            uint256 useCredit =
                creditBalance >= walletTotal ? walletTotal : creditBalance;
            if (useCredit > 0) {
                _credit[predictor] = creditBalance - useCredit;
            }
            uint256 pull = walletTotal - useCredit;
            if (pull > 0) {
                collateralToken.safeTransferFrom(predictor, address(this), pull);
            }
        }

        if (sponsorUse > 0) {
            OnboardingSponsorV2(predictorSponsor)
                .reserve(predictor, sponsorUse, predictorSponsorData);
        }

        _deposits[commitmentHash] = Deposit({
            predictor: predictor,
            sponsor: predictorSponsor,
            walletUse: walletUse,
            sponsorUse: sponsorUse,
            executorTip: executorTip
        });

        emit Locked(
            commitmentHash,
            predictor,
            amountIn,
            executorTip,
            sponsorUse,
            walletUse,
            predictorSponsor
        );
    }

    /// @inheritdoc IPreMintEscrow
    function settle(
        bytes32 commitmentHash,
        uint256 filledIn,
        address collateralSink,
        uint256 tipPaid,
        address tipRecipient
    )
        external
        nonReentrant
        returns (uint256 refundedWallet, uint256 releasedSponsor)
    {
        if (msg.sender != executor) revert UnauthorizedExecutor();
        Deposit memory d = _deposits[commitmentHash];
        if (d.predictor == address(0)) revert CommitmentNotLocked();
        if (tipPaid > d.executorTip) revert TipMismatch();

        // Sponsor-first consumption on `filledIn`.
        uint256 sponsorSpent =
            filledIn >= d.sponsorUse ? d.sponsorUse : filledIn;
        uint256 walletSpent = filledIn - sponsorSpent;

        releasedSponsor = d.sponsorUse - sponsorSpent;
        refundedWallet = d.walletUse - walletSpent;

        delete _deposits[commitmentHash];

        // Move wallet-side collateral to sink (the post-mint escrow).
        if (walletSpent > 0) {
            collateralToken.safeTransfer(collateralSink, walletSpent);
        }
        // Sponsor-side spend: pull from sponsor, forward to sink.
        if (sponsorSpent > 0) {
            OnboardingSponsorV2(d.sponsor).spend(d.predictor, sponsorSpent);
            collateralToken.safeTransfer(collateralSink, sponsorSpent);
        }
        // Release any unused sponsor reservation back to the sponsor pool.
        if (releasedSponsor > 0) {
            OnboardingSponsorV2(d.sponsor).release(d.predictor, releasedSponsor);
        }
        // Wallet refund: becomes credit (predictor can withdraw later).
        if (refundedWallet > 0) {
            _credit[d.predictor] += refundedWallet;
        }
        // Tip handling: `tipPaid` goes to tipRecipient (0 when self-exec →
        // whole tip refunded to wallet credit).
        uint256 tipRefund = d.executorTip - tipPaid;
        if (tipPaid > 0) {
            collateralToken.safeTransfer(tipRecipient, tipPaid);
        }
        if (tipRefund > 0) {
            _credit[d.predictor] += tipRefund;
        }

        emit Settled(
            commitmentHash,
            filledIn,
            refundedWallet,
            releasedSponsor,
            tipPaid,
            tipRecipient
        );
    }

    /// @inheritdoc IPreMintEscrow
    function releaseAll(bytes32 commitmentHash)
        external
        nonReentrant
        returns (uint256 refundedWallet, uint256 releasedSponsor)
    {
        if (msg.sender != executor) revert UnauthorizedExecutor();
        Deposit memory d = _deposits[commitmentHash];
        if (d.predictor == address(0)) revert CommitmentNotLocked();

        refundedWallet = d.walletUse;
        releasedSponsor = d.sponsorUse;

        delete _deposits[commitmentHash];

        if (releasedSponsor > 0) {
            OnboardingSponsorV2(d.sponsor).release(d.predictor, releasedSponsor);
        }
        // Wallet side (including entire unused tip) becomes credit.
        uint256 walletCredit = refundedWallet + d.executorTip;
        if (walletCredit > 0) {
            _credit[d.predictor] += walletCredit;
        }

        emit ReleasedAll(commitmentHash, refundedWallet, releasedSponsor);
    }

    // ============ User-facing ============

    /// @inheritdoc IPreMintEscrow
    function withdrawCredit(address predictor, uint256 amount)
        external
        nonReentrant
    {
        // Only the predictor may withdraw their own credit.
        if (msg.sender != predictor) revert UnauthorizedExecutor();
        uint256 bal = _credit[predictor];
        if (amount > bal) revert InsufficientCredit();
        _credit[predictor] = bal - amount;
        collateralToken.safeTransfer(predictor, amount);
        emit CreditWithdrawn(predictor, amount);
    }

    /// @inheritdoc IPreMintEscrow
    function creditOf(address predictor) external view returns (uint256) {
        return _credit[predictor];
    }

    /// @notice Inspect a locked deposit.
    function depositOf(bytes32 commitmentHash)
        external
        view
        returns (Deposit memory)
    {
        return _deposits[commitmentHash];
    }
}
