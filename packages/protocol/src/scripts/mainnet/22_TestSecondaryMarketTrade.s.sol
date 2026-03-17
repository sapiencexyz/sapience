// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SecondaryMarketEscrow } from "../../SecondaryMarketEscrow.sol";
import {
    ISecondaryMarketEscrow
} from "../../interfaces/ISecondaryMarketEscrow.sol";

/// @title Test Secondary Market Trade (Mainnet)
/// @notice Execute an atomic OTC swap via SecondaryMarketEscrow
/// @dev Seller (COUNTERPARTY) sells position tokens to Buyer (PREDICTOR) for wUSDe
contract TestSecondaryMarketTrade is Script {
    address constant SECONDARY_MARKET_ESCROW =
        0xc46C3140D2c776f83Cf908B3b93f20165e294064;
    address constant COLLATERAL = 0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D;

    struct Actors {
        uint256 sellerPk;
        address seller;
        uint256 buyerPk;
        address buyer;
    }

    struct TradeParams {
        address positionToken;
        uint256 tokenAmount;
        uint256 price;
        uint256 sellerNonce;
        uint256 buyerNonce;
        uint256 deadline;
    }

    function run() external {
        Actors memory actors = _loadActors();
        TradeParams memory params = _loadTradeParams();

        SecondaryMarketEscrow escrow =
            SecondaryMarketEscrow(SECONDARY_MARKET_ESCROW);

        _logSetup(actors, params);
        _logBalancesBefore(actors, params);

        // Compute trade hash
        bytes32 tradeHash = keccak256(
            abi.encode(
                params.positionToken,
                COLLATERAL,
                actors.seller,
                actors.buyer,
                params.tokenAmount,
                params.price
            )
        );

        // Sign trade approvals
        bytes memory sellerSig = _sign(
            escrow,
            tradeHash,
            actors.seller,
            params.sellerNonce,
            params.deadline,
            actors.sellerPk
        );
        bytes memory buyerSig = _sign(
            escrow,
            tradeHash,
            actors.buyer,
            params.buyerNonce,
            params.deadline,
            actors.buyerPk
        );

        // Seller approves escrow to spend position tokens
        vm.startBroadcast(actors.sellerPk);
        IERC20(params.positionToken)
            .approve(SECONDARY_MARKET_ESCROW, params.tokenAmount);
        vm.stopBroadcast();

        // Buyer approves escrow to spend wUSDe
        vm.startBroadcast(actors.buyerPk);
        IERC20(COLLATERAL).approve(SECONDARY_MARKET_ESCROW, params.price);
        vm.stopBroadcast();

        // Execute trade
        ISecondaryMarketEscrow.TradeRequest memory request =
            _buildRequest(actors, params, sellerSig, buyerSig);

        vm.startBroadcast(actors.buyerPk);
        escrow.executeTrade(request);
        vm.stopBroadcast();

        _logBalancesAfter(actors, params);
    }

    function _loadActors() internal view returns (Actors memory a) {
        a.sellerPk = vm.envUint("COUNTERPARTY_PRIVATE_KEY");
        a.seller = vm.addr(a.sellerPk);
        a.buyerPk = vm.envUint("PREDICTOR_PRIVATE_KEY");
        a.buyer = vm.addr(a.buyerPk);
    }

    function _loadTradeParams() internal view returns (TradeParams memory p) {
        p.positionToken = vm.envAddress("POSITION_TOKEN");
        p.tokenAmount = vm.envOr("TOKEN_AMOUNT", uint256(5_000_000_000_000_000));
        p.price = vm.envOr("PRICE", uint256(1_000_000_000_000_000));
        p.sellerNonce = uint256(
            keccak256(abi.encode(block.timestamp, "seller", block.prevrandao))
        );
        p.buyerNonce = uint256(
            keccak256(abi.encode(block.timestamp, "buyer", block.prevrandao))
        );
        p.deadline = block.timestamp + 1 hours;
    }

    function _sign(
        SecondaryMarketEscrow escrow,
        bytes32 tradeHash,
        address signer,
        uint256 nonce,
        uint256 deadline,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 h = escrow.getTradeApprovalHash(
            tradeHash, signer, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, h);
        return abi.encodePacked(r, s, v);
    }

    function _buildRequest(
        Actors memory a,
        TradeParams memory p,
        bytes memory sellerSig,
        bytes memory buyerSig
    ) internal pure returns (ISecondaryMarketEscrow.TradeRequest memory) {
        return ISecondaryMarketEscrow.TradeRequest({
            token: p.positionToken,
            collateral: COLLATERAL,
            seller: a.seller,
            buyer: a.buyer,
            tokenAmount: p.tokenAmount,
            price: p.price,
            sellerNonce: p.sellerNonce,
            buyerNonce: p.buyerNonce,
            sellerDeadline: p.deadline,
            buyerDeadline: p.deadline,
            sellerSignature: sellerSig,
            buyerSignature: buyerSig,
            refCode: bytes32(0),
            sellerSessionKeyData: "",
            buyerSessionKeyData: ""
        });
    }

    function _logSetup(Actors memory a, TradeParams memory p) internal pure {
        console.log("=== Secondary Market Trade Test ===");
        console.log("Seller (counterparty):", a.seller);
        console.log("Buyer (predictor):", a.buyer);
        console.log("Position Token:", p.positionToken);
        console.log("Token Amount:", p.tokenAmount);
        console.log("Price (wUSDe):", p.price);
    }

    function _logBalancesBefore(Actors memory a, TradeParams memory p)
        internal
        view
    {
        console.log("");
        console.log("--- Balances Before ---");
        console.log(
            "Seller position tokens:",
            IERC20(p.positionToken).balanceOf(a.seller)
        );
        console.log("Buyer wUSDe:", IERC20(COLLATERAL).balanceOf(a.buyer));
    }

    function _logBalancesAfter(Actors memory a, TradeParams memory p)
        internal
        view
    {
        console.log("");
        console.log("--- Balances After ---");
        console.log(
            "Seller position tokens:",
            IERC20(p.positionToken).balanceOf(a.seller)
        );
        console.log(
            "Buyer position tokens:", IERC20(p.positionToken).balanceOf(a.buyer)
        );
        console.log("Seller wUSDe:", IERC20(COLLATERAL).balanceOf(a.seller));
        console.log("Buyer wUSDe:", IERC20(COLLATERAL).balanceOf(a.buyer));
        console.log("");
        console.log("=== Trade Executed Successfully ===");
    }
}
