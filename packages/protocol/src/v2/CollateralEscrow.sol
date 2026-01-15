// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ICollateralEscrow.sol";
import "./interfaces/IPositionToken.sol";
import "./interfaces/IPositionTokenFactory.sol";
import "./interfaces/IV2Types.sol";
import "./interfaces/IV2Events.sol";

/**
 * @title CollateralEscrow
 * @notice Holds collateral (WUSDe) and handles distribution after settlement
 * @dev Manages deposits, settlement recording, and proportional redemptions
 */
contract CollateralEscrow is ICollateralEscrow, IV2Events, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The collateral token (WUSDe)
    IERC20 public immutable collateralToken;

    /// @notice The prediction market contract
    address public immutable market;

    /// @notice The token factory
    IPositionTokenFactory public immutable factory;

    /// @notice Escrow records by prediction ID
    mapping(bytes32 => IV2Types.EscrowRecord) private _escrowRecords;

    /// @notice Total collateral claimed per prediction (to track remaining)
    mapping(bytes32 => uint256) private _totalClaimed;

    error Unauthorized();
    error EscrowAlreadyExists();
    error EscrowNotFound();
    error EscrowNotSettled();
    error EscrowAlreadySettled();
    error InvalidTokenAmount();
    error InsufficientAllowance();

    /// @notice Create a new escrow contract
    /// @param collateralToken_ The collateral token address (WUSDe)
    /// @param market_ The prediction market contract
    /// @param factory_ The token factory contract
    constructor(address collateralToken_, address market_, address factory_) {
        collateralToken = IERC20(collateralToken_);
        market = market_;
        factory = IPositionTokenFactory(factory_);
    }

    /// @inheritdoc ICollateralEscrow
    function deposit(
        bytes32 predictionId,
        uint256 predictorWager,
        uint256 counterpartyWager,
        address predictor,
        address counterparty
    ) external nonReentrant {
        if (msg.sender != market) {
            revert Unauthorized();
        }
        if (_escrowRecords[predictionId].totalCollateral > 0) {
            revert EscrowAlreadyExists();
        }

        uint256 totalCollateral = predictorWager + counterpartyWager;

        // Transfer collateral from both parties
        collateralToken.safeTransferFrom(predictor, address(this), predictorWager);
        collateralToken.safeTransferFrom(counterparty, address(this), counterpartyWager);

        // Store escrow record
        _escrowRecords[predictionId] = IV2Types.EscrowRecord({
            totalCollateral: totalCollateral,
            predictorWager: predictorWager,
            counterpartyWager: counterpartyWager,
            predictorTokenClaimable: 0,
            counterpartyTokenClaimable: 0,
            settled: false
        });

        emit CollateralDeposited(predictionId, totalCollateral);
    }

    /// @inheritdoc ICollateralEscrow
    function recordSettlement(
        bytes32 predictionId,
        IV2Types.SettlementResult result,
        uint256 predictorWager,
        uint256 counterpartyWager
    ) external nonReentrant {
        if (msg.sender != market) {
            revert Unauthorized();
        }

        IV2Types.EscrowRecord storage record = _escrowRecords[predictionId];
        if (record.totalCollateral == 0) {
            revert EscrowNotFound();
        }
        if (record.settled) {
            revert EscrowAlreadySettled();
        }

        uint256 totalCollateral = record.totalCollateral;
        uint256 predictorClaimable;
        uint256 counterpartyClaimable;

        if (result == IV2Types.SettlementResult.PREDICTOR_WINS) {
            // Predictor wins: predictor gets all
            predictorClaimable = totalCollateral;
            counterpartyClaimable = 0;
        } else if (result == IV2Types.SettlementResult.COUNTERPARTY_WINS) {
            // Counterparty wins: counterparty gets all
            predictorClaimable = 0;
            counterpartyClaimable = totalCollateral;
        } else if (result == IV2Types.SettlementResult.NON_DECISIVE) {
            // Tie: each gets their original wager back
            predictorClaimable = predictorWager;
            counterpartyClaimable = counterpartyWager;
        } else {
            revert("Invalid settlement result");
        }

        record.predictorTokenClaimable = predictorClaimable;
        record.counterpartyTokenClaimable = counterpartyClaimable;
        record.settled = true;

        emit CollateralDistributed(predictionId, predictorClaimable, counterpartyClaimable);
    }

    /// @inheritdoc ICollateralEscrow
    function redeem(bytes32 predictionId, address positionToken, address holder, uint256 tokenAmount)
        external
        nonReentrant
        returns (uint256 payout)
    {
        if (msg.sender != market) {
            revert Unauthorized();
        }

        IV2Types.EscrowRecord storage record = _escrowRecords[predictionId];
        if (record.totalCollateral == 0) {
            revert EscrowNotFound();
        }
        if (!record.settled) {
            revert EscrowNotSettled();
        }
        if (tokenAmount == 0) {
            revert InvalidTokenAmount();
        }

        // Calculate payout based on token type
        bool isPredictor = factory.isPredictorToken(positionToken);
        uint256 claimablePool = isPredictor ? record.predictorTokenClaimable : record.counterpartyTokenClaimable;

        // Proportional payout: (tokenAmount / TOTAL_SUPPLY) * claimablePool
        // Using fixed point math to avoid precision loss
        uint256 totalSupply = IPositionToken(positionToken).TOTAL_SUPPLY();
        payout = (tokenAmount * claimablePool) / totalSupply;

        if (payout > 0) {
            // Burn the position tokens
            IPositionToken(positionToken).burn(holder, tokenAmount);

            // Update claimed tracking
            _totalClaimed[predictionId] += payout;

            // Transfer collateral to holder
            collateralToken.safeTransfer(holder, payout);

            emit TokensRedeemed(predictionId, holder, positionToken, tokenAmount, payout);
        }
    }

    /// @inheritdoc ICollateralEscrow
    function getEscrowRecord(bytes32 predictionId) external view returns (IV2Types.EscrowRecord memory record) {
        return _escrowRecords[predictionId];
    }

    /// @inheritdoc ICollateralEscrow
    function getClaimableAmount(bytes32 predictionId, address positionToken, uint256 tokenAmount)
        external
        view
        returns (uint256 claimable)
    {
        IV2Types.EscrowRecord storage record = _escrowRecords[predictionId];
        if (!record.settled || tokenAmount == 0) {
            return 0;
        }

        bool isPredictor = factory.isPredictorToken(positionToken);
        uint256 claimablePool = isPredictor ? record.predictorTokenClaimable : record.counterpartyTokenClaimable;
        uint256 totalSupply = IPositionToken(positionToken).TOTAL_SUPPLY();

        return (tokenAmount * claimablePool) / totalSupply;
    }
}
