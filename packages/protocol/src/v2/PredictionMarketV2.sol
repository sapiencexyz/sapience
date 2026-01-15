// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IPredictionMarketV2.sol";
import "./interfaces/IConditionResolver.sol";
import "./interfaces/ICollateralEscrow.sol";
import "./interfaces/IPositionTokenFactory.sol";
import "./interfaces/IV2Types.sol";
import "./interfaces/IV2Events.sol";
import "./utils/SignatureValidator.sol";

/**
 * @title PredictionMarketV2
 * @notice Main orchestrator for the V2 Prediction Market protocol
 * @dev Handles mint, settle, and redeem with integrated parlay resolution logic
 */
contract PredictionMarketV2 is IPredictionMarketV2, IV2Events, ReentrancyGuard, SignatureValidator {
    /// @notice The collateral escrow contract
    ICollateralEscrow public immutable escrow;

    /// @notice The position token factory
    IPositionTokenFactory public immutable factory;

    /// @notice Mapping from predictionId to prediction data
    mapping(bytes32 => IV2Types.Prediction) private _predictions;

    /// @notice Mapping from predictionId to picks array
    mapping(bytes32 => IV2Types.Pick[]) private _predictionPicks;

    /// @notice Nonces for replay protection (per account)
    mapping(address => uint256) private _nonces;

    /// @notice Create a new prediction market
    /// @param escrow_ The collateral escrow contract
    /// @param factory_ The position token factory
    constructor(address escrow_, address factory_) {
        escrow = ICollateralEscrow(escrow_);
        factory = IPositionTokenFactory(factory_);
    }

    // ============ External Functions ============

    /// @inheritdoc IPredictionMarketV2
    function mint(IV2Types.MintRequest calldata request)
        external
        nonReentrant
        returns (bytes32 predictionId, address predictorToken, address counterpartyToken)
    {
        // Validate basic parameters
        if (request.picks.length == 0) {
            revert InvalidPicks();
        }
        if (request.predictorWager == 0 || request.counterpartyWager == 0) {
            revert ZeroWager();
        }

        // Validate picks (canonical order, no duplicates, valid conditions)
        _validatePicks(request.picks);

        // Compute prediction ID from canonical picks
        predictionId = _computePredictionId(request.picks);

        // Check prediction doesn't already exist
        if (_predictions[predictionId].predictorToken != address(0)) {
            revert PredictionAlreadyExists();
        }

        // Compute prediction hash for signatures (includes wagers and addresses)
        bytes32 predictionHash = keccak256(
            abi.encode(predictionId, request.predictorWager, request.counterpartyWager, request.predictor, request.counterparty)
        );

        // Validate predictor signature (EOA or session key)
        if (!_validatePartySignature(
            predictionHash,
            request.predictor,
            request.predictorWager,
            request.predictorNonce,
            request.predictorDeadline,
            request.predictorSignature,
            request.predictorSessionKeyData
        )) {
            revert InvalidSignature();
        }
        if (request.predictorNonce != _nonces[request.predictor]) {
            revert InvalidNonce();
        }

        // Validate counterparty signature (EOA or session key)
        if (!_validatePartySignature(
            predictionHash,
            request.counterparty,
            request.counterpartyWager,
            request.counterpartyNonce,
            request.counterpartyDeadline,
            request.counterpartySignature,
            request.counterpartySessionKeyData
        )) {
            revert InvalidSignature();
        }
        if (request.counterpartyNonce != _nonces[request.counterparty]) {
            revert InvalidNonce();
        }

        // Increment nonces
        _nonces[request.predictor]++;
        _nonces[request.counterparty]++;

        // Deposit collateral to escrow
        escrow.deposit(
            predictionId,
            request.predictorWager,
            request.counterpartyWager,
            request.predictor,
            request.counterparty
        );

        // Create position tokens
        (predictorToken, counterpartyToken) =
            factory.createTokenPair(predictionId, request.predictor, request.counterparty);

        // Store prediction data
        _predictions[predictionId] = IV2Types.Prediction({
            predictionId: predictionId,
            predictorWager: request.predictorWager,
            counterpartyWager: request.counterpartyWager,
            predictor: request.predictor,
            counterparty: request.counterparty,
            predictorToken: predictorToken,
            counterpartyToken: counterpartyToken,
            settled: false,
            result: IV2Types.SettlementResult.UNRESOLVED
        });

        // Store picks
        for (uint256 i = 0; i < request.picks.length; i++) {
            _predictionPicks[predictionId].push(request.picks[i]);
        }

        emit PredictionCreated(
            predictionId,
            request.predictor,
            request.counterparty,
            predictorToken,
            counterpartyToken,
            request.predictorWager,
            request.counterpartyWager,
            request.refCode
        );
    }

    /// @inheritdoc IPredictionMarketV2
    function settle(bytes32 predictionId) external nonReentrant {
        IV2Types.Prediction storage prediction = _predictions[predictionId];

        if (prediction.predictorToken == address(0)) {
            revert PredictionNotFound();
        }
        if (prediction.settled) {
            revert PredictionAlreadySettled();
        }

        // Resolve the prediction using integrated parlay logic
        (bool canResolve, IV2Types.SettlementResult result) = _resolvePrediction(predictionId);

        if (!canResolve) {
            revert PredictionNotResolvable();
        }

        // Record settlement in escrow
        escrow.recordSettlement(predictionId, result, prediction.predictorWager, prediction.counterpartyWager);

        // Update prediction state
        prediction.settled = true;
        prediction.result = result;

        // Calculate claimable amounts for event
        uint256 totalCollateral = prediction.predictorWager + prediction.counterpartyWager;
        uint256 predictorClaimable;
        uint256 counterpartyClaimable;

        if (result == IV2Types.SettlementResult.PREDICTOR_WINS) {
            predictorClaimable = totalCollateral;
        } else if (result == IV2Types.SettlementResult.COUNTERPARTY_WINS) {
            counterpartyClaimable = totalCollateral;
        } else {
            predictorClaimable = prediction.predictorWager;
            counterpartyClaimable = prediction.counterpartyWager;
        }

        emit PredictionSettled(predictionId, result, predictorClaimable, counterpartyClaimable);
    }

    /// @inheritdoc IPredictionMarketV2
    function redeem(address positionToken, uint256 amount) external nonReentrant returns (uint256 payout) {
        if (!factory.isPositionToken(positionToken)) {
            revert InvalidToken();
        }

        bytes32 predictionId = factory.getPredictionId(positionToken);
        IV2Types.Prediction storage prediction = _predictions[predictionId];

        if (!prediction.settled) {
            revert PredictionNotSettled();
        }

        // Redeem through escrow (handles burn and transfer)
        payout = escrow.redeem(predictionId, positionToken, msg.sender, amount);
    }

    // ============ View Functions ============

    /// @inheritdoc IPredictionMarketV2
    function getPrediction(bytes32 predictionId) external view returns (IV2Types.Prediction memory prediction) {
        return _predictions[predictionId];
    }

    /// @inheritdoc IPredictionMarketV2
    function getTokenPair(bytes32 predictionId) external view returns (IV2Types.TokenPair memory tokenPair) {
        return factory.getTokenPair(predictionId);
    }

    /// @inheritdoc IPredictionMarketV2
    function getNonce(address account) external view returns (uint256 nonce) {
        return _nonces[account];
    }

    /// @inheritdoc IPredictionMarketV2
    function canSettle(bytes32 predictionId) external view returns (bool) {
        IV2Types.Prediction storage prediction = _predictions[predictionId];
        if (prediction.predictorToken == address(0) || prediction.settled) {
            return false;
        }
        (bool canResolve,) = _resolvePrediction(predictionId);
        return canResolve;
    }

    /// @inheritdoc IPredictionMarketV2
    function getPicks(bytes32 predictionId) external view returns (IV2Types.Pick[] memory picks) {
        return _predictionPicks[predictionId];
    }

    // ============ Internal Functions ============

    /// @notice Validate picks array (canonical order, no duplicates, valid conditions)
    function _validatePicks(IV2Types.Pick[] calldata picks) internal view {
        for (uint256 i = 0; i < picks.length; i++) {
            // Check condition is valid
            if (!IConditionResolver(picks[i].conditionResolver).isValidCondition(picks[i].conditionId)) {
                revert InvalidPicks();
            }

            // Check for duplicates and canonical ordering
            if (i > 0) {
                IV2Types.Pick calldata prev = picks[i - 1];
                IV2Types.Pick calldata curr = picks[i];

                // Compare (resolver, conditionId) - must be strictly increasing
                if (prev.conditionResolver > curr.conditionResolver) {
                    revert PicksNotCanonical();
                }
                if (prev.conditionResolver == curr.conditionResolver) {
                    if (prev.conditionId >= curr.conditionId) {
                        if (prev.conditionId == curr.conditionId) {
                            revert DuplicatePick();
                        }
                        revert PicksNotCanonical();
                    }
                }
            }
        }
    }

    /// @notice Compute prediction ID from picks
    function _computePredictionId(IV2Types.Pick[] calldata picks) internal pure returns (bytes32) {
        return keccak256(abi.encode(picks));
    }

    /// @notice Resolve a prediction using integrated parlay logic
    /// @dev Queries each condition resolver and applies parlay semantics
    function _resolvePrediction(bytes32 predictionId)
        internal
        view
        returns (bool canResolve, IV2Types.SettlementResult result)
    {
        IV2Types.Pick[] storage picks = _predictionPicks[predictionId];
        bool hasNonDecisive = false;

        for (uint256 i = 0; i < picks.length; i++) {
            IV2Types.Pick storage pick = picks[i];

            (bool isResolved, IV2Types.OutcomeVector memory outcome) =
                IConditionResolver(pick.conditionResolver).getResolution(pick.conditionId);

            // If any pick is unresolved, prediction cannot be resolved
            if (!isResolved) {
                return (false, IV2Types.SettlementResult.UNRESOLVED);
            }

            // Check if outcome is decisive
            bool isDecisiveYes = outcome.yesWeight > 0 && outcome.noWeight == 0;
            bool isDecisiveNo = outcome.yesWeight == 0 && outcome.noWeight > 0;

            if (!isDecisiveYes && !isDecisiveNo) {
                // Non-decisive outcome (tie)
                hasNonDecisive = true;
                continue;
            }

            // Check if pick matches outcome
            bool pickMatchesYes = pick.predictedOutcome == IV2Types.OutcomeSide.YES && isDecisiveYes;
            bool pickMatchesNo = pick.predictedOutcome == IV2Types.OutcomeSide.NO && isDecisiveNo;

            if (!pickMatchesYes && !pickMatchesNo) {
                // Decisive loss for predictor - counterparty wins immediately
                return (true, IV2Types.SettlementResult.COUNTERPARTY_WINS);
            }
        }

        // All picks resolved and matched (or were non-decisive)
        if (hasNonDecisive) {
            return (true, IV2Types.SettlementResult.NON_DECISIVE);
        }

        // All picks matched decisively - predictor wins
        return (true, IV2Types.SettlementResult.PREDICTOR_WINS);
    }

    /// @notice Validate a party's signature (supports both EOA and session key)
    /// @param predictionHash Hash of the prediction parameters
    /// @param signer The expected signer address (EOA or smart account)
    /// @param wager Wager amount
    /// @param nonce Nonce for replay protection
    /// @param deadline Signature expiration timestamp
    /// @param signature The signature bytes
    /// @param sessionKeyData ABI-encoded SessionKeyData (empty if EOA)
    /// @return isValid True if the signature is valid
    function _validatePartySignature(
        bytes32 predictionHash,
        address signer,
        uint256 wager,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature,
        bytes calldata sessionKeyData
    ) internal view returns (bool isValid) {
        if (sessionKeyData.length == 0) {
            // EOA signature - use standard validation
            return _isApprovalValid(predictionHash, signer, wager, nonce, deadline, signature);
        } else {
            // Session key signature - decode and validate
            IV2Types.SessionKeyData memory skData = abi.decode(sessionKeyData, (IV2Types.SessionKeyData));

            SessionKeyApproval memory approval = SessionKeyApproval({
                sessionKey: skData.sessionKey,
                owner: skData.owner,
                smartAccount: signer,
                validUntil: skData.validUntil,
                permissionsHash: skData.permissionsHash,
                ownerSignature: skData.ownerSignature
            });

            return _isSessionKeyApprovalValid(
                predictionHash,
                signer,
                wager,
                nonce,
                deadline,
                signature,
                approval
            );
        }
    }
}
