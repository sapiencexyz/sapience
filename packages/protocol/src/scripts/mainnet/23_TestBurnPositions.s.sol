// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { PredictionMarketEscrow } from "../../PredictionMarketEscrow.sol";
import { IV2Types } from "../../interfaces/IV2Types.sol";

/// @title Test Burn Positions (Mainnet)
/// @notice Burn bilateral positions to recover collateral from PredictionMarketEscrow
/// @dev PREDICTOR holds both predictor and counterparty tokens, burns equal amounts
contract TestBurnPositions is Script {
    address constant MARKET = 0x243022eBf5d66741499d76555CADFDE51e101e03;
    address constant COLLATERAL = 0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D;

    struct BurnConfig {
        uint256 pk;
        address holder;
        address predictorToken;
        address counterpartyToken;
        bytes32 pickConfigId;
        uint256 burnAmount;
        uint256 totalPayout;
    }

    function run() external {
        BurnConfig memory c = _setup();

        _logBefore(c);

        IV2Types.BurnRequest memory request = _buildSignedRequest(c);

        vm.startBroadcast(c.pk);
        PredictionMarketEscrow(MARKET).burn(request);
        vm.stopBroadcast();

        _logAfter(c);
    }

    function _setup() internal view returns (BurnConfig memory c) {
        c.pk = vm.envUint("PREDICTOR_PRIVATE_KEY");
        c.holder = vm.addr(c.pk);
        c.counterpartyToken = vm.envAddress("COUNTERPARTY_TOKEN");

        PredictionMarketEscrow market = PredictionMarketEscrow(MARKET);
        c.pickConfigId = market.getPickConfigIdFromToken(c.counterpartyToken);
        c.predictorToken = market.getTokenPair(c.pickConfigId).predictorToken;

        uint256 pBal = IERC20(c.predictorToken).balanceOf(c.holder);
        uint256 cBal = IERC20(c.counterpartyToken).balanceOf(c.holder);
        c.burnAmount = vm.envOr("BURN_AMOUNT", pBal < cBal ? pBal : cBal);

        IV2Types.PickConfiguration memory config =
            market.getPickConfiguration(c.pickConfigId);
        uint256 pBacking = config.totalPredictorTokensMinted > 0
            ? (c.burnAmount * config.totalPredictorCollateral)
                / config.totalPredictorTokensMinted
            : 0;
        uint256 cBacking = config.totalCounterpartyTokensMinted > 0
            ? (c.burnAmount * config.totalCounterpartyCollateral)
                / config.totalCounterpartyTokensMinted
            : 0;
        c.totalPayout = pBacking + cBacking;
    }

    struct SignInput {
        bytes32 burnHash;
        uint256 tokenAmount;
        uint256 payout;
        uint256 nonce;
        uint256 deadline;
    }

    function _buildSignedRequest(BurnConfig memory c)
        internal
        view
        returns (IV2Types.BurnRequest memory)
    {
        uint256 pNonce = uint256(
            keccak256(abi.encode(block.timestamp, "bp", block.prevrandao))
        );
        uint256 cNonce = uint256(
            keccak256(abi.encode(block.timestamp, "bc", block.prevrandao))
        );
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 burnHash = _computeBurnHash(c);

        bytes memory pSig = _sign(
            c,
            SignInput(burnHash, c.burnAmount, c.totalPayout, pNonce, deadline)
        );
        bytes memory cSig =
            _sign(c, SignInput(burnHash, c.burnAmount, 0, cNonce, deadline));

        return _assembleRequest(c, pNonce, cNonce, deadline, pSig, cSig);
    }

    function _assembleRequest(
        BurnConfig memory c,
        uint256 pNonce,
        uint256 cNonce,
        uint256 deadline,
        bytes memory pSig,
        bytes memory cSig
    ) internal pure returns (IV2Types.BurnRequest memory) {
        return IV2Types.BurnRequest({
                pickConfigId: c.pickConfigId,
                predictorTokenAmount: c.burnAmount,
                counterpartyTokenAmount: c.burnAmount,
                predictorHolder: c.holder,
                counterpartyHolder: c.holder,
                predictorPayout: c.totalPayout,
                counterpartyPayout: 0,
                predictorNonce: pNonce,
                counterpartyNonce: cNonce,
                predictorDeadline: deadline,
                counterpartyDeadline: deadline,
                predictorSignature: pSig,
                counterpartySignature: cSig,
                refCode: bytes32(0),
                predictorSessionKeyData: "",
                counterpartySessionKeyData: ""
            });
    }

    function _computeBurnHash(BurnConfig memory c)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                c.pickConfigId,
                c.burnAmount,
                c.burnAmount,
                c.holder,
                c.holder,
                c.totalPayout,
                uint256(0)
            )
        );
    }

    function _sign(BurnConfig memory c, SignInput memory s)
        internal
        view
        returns (bytes memory)
    {
        bytes32 h = PredictionMarketEscrow(MARKET)
            .getBurnApprovalHash(
                s.burnHash,
                c.holder,
                s.tokenAmount,
                s.payout,
                s.nonce,
                s.deadline
            );
        (uint8 v, bytes32 r, bytes32 ss) = vm.sign(c.pk, h);
        return abi.encodePacked(r, ss, v);
    }

    function _logBefore(BurnConfig memory c) internal view {
        console.log("=== Burn Positions Test ===");
        console.log("Holder:", c.holder);
        console.log("Burn Amount (each):", c.burnAmount);
        console.log("Total Payout:", c.totalPayout);
        console.log("");
        console.log("--- Before ---");
        console.log(
            "Predictor tokens:", IERC20(c.predictorToken).balanceOf(c.holder)
        );
        console.log(
            "Counterparty tokens:",
            IERC20(c.counterpartyToken).balanceOf(c.holder)
        );
        console.log("wUSDe:", IERC20(COLLATERAL).balanceOf(c.holder));
    }

    function _logAfter(BurnConfig memory c) internal view {
        console.log("");
        console.log("--- After ---");
        console.log(
            "Predictor tokens:", IERC20(c.predictorToken).balanceOf(c.holder)
        );
        console.log(
            "Counterparty tokens:",
            IERC20(c.counterpartyToken).balanceOf(c.holder)
        );
        console.log("wUSDe:", IERC20(COLLATERAL).balanceOf(c.holder));
        console.log("");
        console.log("=== Burn Executed Successfully ===");
    }
}
