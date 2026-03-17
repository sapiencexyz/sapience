// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/SecondaryMarketEscrow.sol";
import "../src/interfaces/ISecondaryMarketEscrow.sol";
import "../src/interfaces/IV2Types.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "./mocks/MockERC20.sol";

/// @notice Mock smart account implementing EIP-1271
contract MockSmartAccountForTrade is IERC1271 {
    address public owner;
    bytes4 private constant EIP1271_MAGIC_VALUE = 0x1626ba7e;

    constructor(address _owner) {
        owner = _owner;
    }

    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        override
        returns (bytes4)
    {
        (uint8 v, bytes32 r, bytes32 s) = _splitSignature(signature);
        address signer = ecrecover(hash, v, r, s);
        if (signer == owner) {
            return EIP1271_MAGIC_VALUE;
        }
        return 0xffffffff;
    }

    function _splitSignature(bytes memory sig)
        internal
        pure
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        require(sig.length == 65, "Invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}

/// @notice Mock smart account that accepts both 65-byte and 64-byte (EIP-2098 compact) sigs
contract MockSmartAccountCompact is IERC1271 {
    address public owner;
    bytes4 private constant EIP1271_MAGIC_VALUE = 0x1626ba7e;

    constructor(address _owner) {
        owner = _owner;
    }

    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        override
        returns (bytes4)
    {
        uint8 v;
        bytes32 r;
        bytes32 s;
        if (signature.length == 65) {
            assembly {
                r := mload(add(signature, 32))
                s := mload(add(signature, 64))
                v := byte(0, mload(add(signature, 96)))
            }
        } else if (signature.length == 64) {
            // EIP-2098 compact: r (32) ++ vs (32)
            bytes32 vs;
            assembly {
                r := mload(add(signature, 32))
                vs := mload(add(signature, 64))
            }
            s = vs
                & bytes32(
                    0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
                );
            v = uint8(uint256(vs >> 255)) + 27;
        } else {
            return 0xffffffff;
        }
        address signer = ecrecover(hash, v, r, s);
        if (signer == owner) {
            return EIP1271_MAGIC_VALUE;
        }
        return 0xffffffff;
    }
}

/// @notice Mock account factory for session key tests
/// @notice Mock 2-of-3 multisig implementing EIP-1271
/// Signature = abi.encode(bytes[] sigs) where each inner sig is a 65-byte ECDSA sig.
/// Validates that at least `threshold` unique registered signers approved the hash.
contract MockMultisig is IERC1271 {
    bytes4 private constant EIP1271_MAGIC_VALUE = 0x1626ba7e;
    uint256 public threshold;
    mapping(address => bool) public isSigner;

    constructor(address[] memory signers, uint256 _threshold) {
        threshold = _threshold;
        for (uint256 i = 0; i < signers.length; i++) {
            isSigner[signers[i]] = true;
        }
    }

    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        override
        returns (bytes4)
    {
        bytes[] memory sigs = abi.decode(signature, (bytes[]));
        uint256 valid = 0;
        address lastSigner = address(0);
        for (uint256 i = 0; i < sigs.length; i++) {
            (uint8 v, bytes32 r, bytes32 s) = _split(sigs[i]);
            address recovered = ecrecover(hash, v, r, s);
            // Enforce ascending order to prevent duplicates
            if (recovered > lastSigner && isSigner[recovered]) {
                valid++;
                lastSigner = recovered;
            }
        }
        return valid >= threshold ? EIP1271_MAGIC_VALUE : bytes4(0xffffffff);
    }

    function _split(bytes memory sig)
        internal
        pure
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        require(sig.length == 65);
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }
}

contract MockAccountFactory {
    mapping(address => mapping(uint256 => address)) private _accounts;

    function setAccount(address owner, uint256 index, address account)
        external
    {
        _accounts[owner][index] = account;
    }

    function getAccountAddress(address owner, uint256 index)
        external
        view
        returns (address)
    {
        return _accounts[owner][index];
    }
}

contract SecondaryMarketEscrowTest is Test {
    SecondaryMarketEscrow public escrow;
    MockERC20 public positionToken;
    MockERC20 public collateralToken;

    address public seller;
    address public buyer;
    address public relayer;

    uint256 public sellerPk;
    uint256 public buyerPk;

    uint256 public constant TOKEN_AMOUNT = 100e18;
    uint256 public constant PRICE = 50e18;
    bytes32 public constant REF_CODE = keccak256("test-ref");

    uint256 private _nextNonce = 1;

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
    }

    function setUp() public {
        sellerPk = 2;
        seller = vm.addr(sellerPk);
        buyerPk = 3;
        buyer = vm.addr(buyerPk);
        relayer = vm.addr(4);

        // Deploy contracts (no account factory for basic tests)
        escrow = new SecondaryMarketEscrow(address(0));
        positionToken = new MockERC20("Position Token", "POS", 18);
        collateralToken = new MockERC20("Collateral", "USDE", 18);

        // Fund accounts
        positionToken.mint(seller, 10_000e18);
        collateralToken.mint(buyer, 10_000e18);

        // Approvals
        vm.prank(seller);
        positionToken.approve(address(escrow), type(uint256).max);
        vm.prank(buyer);
        collateralToken.approve(address(escrow), type(uint256).max);
    }

    // ============ Helpers ============

    function _computeTradeHash(
        address token,
        address collateral,
        address _seller,
        address _buyer,
        uint256 tokenAmount,
        uint256 price
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(token, collateral, _seller, _buyer, tokenAmount, price)
        );
    }

    function _signTradeApproval(
        bytes32 tradeHash,
        address signer,
        uint256 nonce,
        uint256 deadline,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 approvalHash = escrow.getTradeApprovalHash(
            tradeHash, signer, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, approvalHash);
        return abi.encodePacked(r, s, v);
    }

    function _createTradeRequest()
        internal
        returns (ISecondaryMarketEscrow.TradeRequest memory request)
    {
        return _createTradeRequestWith(
            seller, buyer, TOKEN_AMOUNT, PRICE, sellerPk, buyerPk
        );
    }

    function _createTradeRequestWith(
        address _seller,
        address _buyer,
        uint256 tokenAmount,
        uint256 price,
        uint256 _sellerPk,
        uint256 _buyerPk
    ) internal returns (ISecondaryMarketEscrow.TradeRequest memory request) {
        bytes32 tradeHash = _computeTradeHash(
            address(positionToken),
            address(collateralToken),
            _seller,
            _buyer,
            tokenAmount,
            price
        );

        uint256 sNonce = _freshNonce();
        uint256 bNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        request.token = address(positionToken);
        request.collateral = address(collateralToken);
        request.seller = _seller;
        request.buyer = _buyer;
        request.tokenAmount = tokenAmount;
        request.price = price;
        request.sellerNonce = sNonce;
        request.buyerNonce = bNonce;
        request.sellerDeadline = deadline;
        request.buyerDeadline = deadline;
        request.sellerSignature =
            _signTradeApproval(tradeHash, _seller, sNonce, deadline, _sellerPk);
        request.buyerSignature =
            _signTradeApproval(tradeHash, _buyer, bNonce, deadline, _buyerPk);
        request.refCode = REF_CODE;
        request.sellerSessionKeyData = "";
        request.buyerSessionKeyData = "";
    }

    // ============ Happy Path ============

    function test_executeTrade_basic() public {
        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequest();

        uint256 sellerPosBefore = positionToken.balanceOf(seller);
        uint256 sellerColBefore = collateralToken.balanceOf(seller);
        uint256 buyerPosBefore = positionToken.balanceOf(buyer);
        uint256 buyerColBefore = collateralToken.balanceOf(buyer);

        vm.prank(relayer);
        escrow.executeTrade(request);

        // Seller: lost position tokens, gained collateral
        assertEq(
            positionToken.balanceOf(seller), sellerPosBefore - TOKEN_AMOUNT
        );
        assertEq(collateralToken.balanceOf(seller), sellerColBefore + PRICE);

        // Buyer: gained position tokens, lost collateral
        assertEq(positionToken.balanceOf(buyer), buyerPosBefore + TOKEN_AMOUNT);
        assertEq(collateralToken.balanceOf(buyer), buyerColBefore - PRICE);
    }

    function test_executeTrade_emitsEvent() public {
        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequest();

        bytes32 tradeHash = _computeTradeHash(
            address(positionToken),
            address(collateralToken),
            seller,
            buyer,
            TOKEN_AMOUNT,
            PRICE
        );

        vm.expectEmit(true, true, true, true);
        emit ISecondaryMarketEscrow.TradeExecuted(
            tradeHash,
            seller,
            buyer,
            address(positionToken),
            address(collateralToken),
            TOKEN_AMOUNT,
            PRICE,
            REF_CODE
        );

        escrow.executeTrade(request);
    }

    function test_executeTrade_marksNoncesUsed() public {
        uint256 savedNext = _nextNonce;

        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequest();

        // _createTradeRequest called _freshNonce twice (savedNext and savedNext+1)
        assertFalse(escrow.isNonceUsed(seller, savedNext));
        assertFalse(escrow.isNonceUsed(buyer, savedNext + 1));

        escrow.executeTrade(request);

        assertTrue(escrow.isNonceUsed(seller, savedNext));
        assertTrue(escrow.isNonceUsed(buyer, savedNext + 1));
    }

    function test_executeTrade_multipleSequential() public {
        // First trade
        ISecondaryMarketEscrow.TradeRequest memory request1 =
            _createTradeRequest();
        escrow.executeTrade(request1);

        // Second trade (different nonces)
        ISecondaryMarketEscrow.TradeRequest memory request2 =
            _createTradeRequest();
        escrow.executeTrade(request2);

        assertEq(positionToken.balanceOf(buyer), TOKEN_AMOUNT * 2);
    }

    function test_executeTrade_anyoneCanSubmit() public {
        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequest();

        // Random address submits the trade
        address randomCaller = vm.addr(99);
        vm.prank(randomCaller);
        escrow.executeTrade(request);

        // Trade still executed correctly
        assertEq(positionToken.balanceOf(buyer), TOKEN_AMOUNT);
    }

    // ============ Input Validation ============

    function test_executeTrade_revertsOnZeroTokenAmount() public {
        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequest();
        request.tokenAmount = 0;

        vm.expectRevert(ISecondaryMarketEscrow.ZeroAmount.selector);
        escrow.executeTrade(request);
    }

    function test_executeTrade_revertsOnZeroPrice() public {
        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequest();
        request.price = 0;

        vm.expectRevert(ISecondaryMarketEscrow.ZeroAmount.selector);
        escrow.executeTrade(request);
    }

    function test_executeTrade_revertsOnSellerEqualsBuyer() public {
        // Fund seller with collateral too
        collateralToken.mint(seller, 10_000e18);
        vm.prank(seller);
        collateralToken.approve(address(escrow), type(uint256).max);

        bytes32 tradeHash = _computeTradeHash(
            address(positionToken),
            address(collateralToken),
            seller,
            seller,
            TOKEN_AMOUNT,
            PRICE
        );

        uint256 nonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        ISecondaryMarketEscrow.TradeRequest memory request;
        request.token = address(positionToken);
        request.collateral = address(collateralToken);
        request.seller = seller;
        request.buyer = seller;
        request.tokenAmount = TOKEN_AMOUNT;
        request.price = PRICE;
        request.sellerNonce = nonce;
        request.buyerNonce = nonce;
        request.sellerDeadline = deadline;
        request.buyerDeadline = deadline;
        request.sellerSignature =
            _signTradeApproval(tradeHash, seller, nonce, deadline, sellerPk);
        request.buyerSignature =
            _signTradeApproval(tradeHash, seller, nonce, deadline, sellerPk);
        request.refCode = REF_CODE;
        request.sellerSessionKeyData = "";
        request.buyerSessionKeyData = "";

        vm.expectRevert(ISecondaryMarketEscrow.SellerBuyerSame.selector);
        escrow.executeTrade(request);
    }

    // ============ Signature Failures ============

    function test_executeTrade_revertsOnInvalidSellerSignature() public {
        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequest();

        // Replace seller signature with one signed by wrong key
        bytes32 tradeHash = _computeTradeHash(
            address(positionToken),
            address(collateralToken),
            seller,
            buyer,
            TOKEN_AMOUNT,
            PRICE
        );

        request.sellerSignature = _signTradeApproval(
            tradeHash,
            seller,
            request.sellerNonce,
            request.sellerDeadline,
            buyerPk // Wrong key
        );

        vm.expectRevert(ISecondaryMarketEscrow.InvalidSignature.selector);
        escrow.executeTrade(request);
    }

    function test_executeTrade_revertsOnInvalidBuyerSignature() public {
        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequest();

        // Replace buyer signature with one signed by wrong key
        bytes32 tradeHash = _computeTradeHash(
            address(positionToken),
            address(collateralToken),
            seller,
            buyer,
            TOKEN_AMOUNT,
            PRICE
        );

        request.buyerSignature = _signTradeApproval(
            tradeHash,
            buyer,
            request.buyerNonce,
            request.buyerDeadline,
            sellerPk // Wrong key
        );

        vm.expectRevert(ISecondaryMarketEscrow.InvalidSignature.selector);
        escrow.executeTrade(request);
    }

    function test_executeTrade_revertsOnReusedSellerNonce() public {
        // Execute a trade first to mark nonces as used
        ISecondaryMarketEscrow.TradeRequest memory request1 =
            _createTradeRequest();
        uint256 usedSellerNonce = request1.sellerNonce;
        escrow.executeTrade(request1);

        // Create a new request reusing the seller's nonce
        ISecondaryMarketEscrow.TradeRequest memory request2 =
            _createTradeRequest();

        bytes32 tradeHash = _computeTradeHash(
            address(positionToken),
            address(collateralToken),
            seller,
            buyer,
            TOKEN_AMOUNT,
            PRICE
        );
        uint256 deadline = block.timestamp + 1 hours;

        request2.sellerNonce = usedSellerNonce;
        request2.sellerSignature = _signTradeApproval(
            tradeHash, seller, usedSellerNonce, deadline, sellerPk
        );

        vm.expectRevert(ISecondaryMarketEscrow.NonceAlreadyUsed.selector);
        escrow.executeTrade(request2);
    }

    function test_executeTrade_revertsOnReusedBuyerNonce() public {
        // Execute a trade first to mark nonces as used
        ISecondaryMarketEscrow.TradeRequest memory request1 =
            _createTradeRequest();
        uint256 usedBuyerNonce = request1.buyerNonce;
        escrow.executeTrade(request1);

        // Create a new request reusing the buyer's nonce
        ISecondaryMarketEscrow.TradeRequest memory request2 =
            _createTradeRequest();

        bytes32 tradeHash = _computeTradeHash(
            address(positionToken),
            address(collateralToken),
            seller,
            buyer,
            TOKEN_AMOUNT,
            PRICE
        );
        uint256 deadline = block.timestamp + 1 hours;

        request2.buyerNonce = usedBuyerNonce;
        request2.buyerSignature = _signTradeApproval(
            tradeHash, buyer, usedBuyerNonce, deadline, buyerPk
        );

        vm.expectRevert(ISecondaryMarketEscrow.NonceAlreadyUsed.selector);
        escrow.executeTrade(request2);
    }

    function test_executeTrade_revertsOnExpiredSellerDeadline() public {
        bytes32 tradeHash = _computeTradeHash(
            address(positionToken),
            address(collateralToken),
            seller,
            buyer,
            TOKEN_AMOUNT,
            PRICE
        );

        uint256 sNonce = _freshNonce();
        uint256 bNonce = _freshNonce();
        uint256 expiredDeadline = block.timestamp - 1;
        uint256 validDeadline = block.timestamp + 1 hours;

        ISecondaryMarketEscrow.TradeRequest memory request;
        request.token = address(positionToken);
        request.collateral = address(collateralToken);
        request.seller = seller;
        request.buyer = buyer;
        request.tokenAmount = TOKEN_AMOUNT;
        request.price = PRICE;
        request.sellerNonce = sNonce;
        request.buyerNonce = bNonce;
        request.sellerDeadline = expiredDeadline;
        request.buyerDeadline = validDeadline;
        request.sellerSignature = _signTradeApproval(
            tradeHash, seller, sNonce, expiredDeadline, sellerPk
        );
        request.buyerSignature = _signTradeApproval(
            tradeHash, buyer, bNonce, validDeadline, buyerPk
        );
        request.refCode = REF_CODE;
        request.sellerSessionKeyData = "";
        request.buyerSessionKeyData = "";

        vm.expectRevert(ISecondaryMarketEscrow.InvalidSignature.selector);
        escrow.executeTrade(request);
    }

    function test_executeTrade_revertsOnExpiredBuyerDeadline() public {
        bytes32 tradeHash = _computeTradeHash(
            address(positionToken),
            address(collateralToken),
            seller,
            buyer,
            TOKEN_AMOUNT,
            PRICE
        );

        uint256 sNonce = _freshNonce();
        uint256 bNonce = _freshNonce();
        uint256 validDeadline = block.timestamp + 1 hours;
        uint256 expiredDeadline = block.timestamp - 1;

        ISecondaryMarketEscrow.TradeRequest memory request;
        request.token = address(positionToken);
        request.collateral = address(collateralToken);
        request.seller = seller;
        request.buyer = buyer;
        request.tokenAmount = TOKEN_AMOUNT;
        request.price = PRICE;
        request.sellerNonce = sNonce;
        request.buyerNonce = bNonce;
        request.sellerDeadline = validDeadline;
        request.buyerDeadline = expiredDeadline;
        request.sellerSignature = _signTradeApproval(
            tradeHash, seller, sNonce, validDeadline, sellerPk
        );
        request.buyerSignature = _signTradeApproval(
            tradeHash, buyer, bNonce, expiredDeadline, buyerPk
        );
        request.refCode = REF_CODE;
        request.sellerSessionKeyData = "";
        request.buyerSessionKeyData = "";

        vm.expectRevert(ISecondaryMarketEscrow.InvalidSignature.selector);
        escrow.executeTrade(request);
    }

    function test_executeTrade_revertsOnSwappedSignatures() public {
        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequest();

        // Swap signatures
        bytes memory temp = request.sellerSignature;
        request.sellerSignature = request.buyerSignature;
        request.buyerSignature = temp;

        vm.expectRevert(ISecondaryMarketEscrow.InvalidSignature.selector);
        escrow.executeTrade(request);
    }

    // ============ Replay Protection ============

    function test_executeTrade_replayFails() public {
        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequest();

        // First execution succeeds
        escrow.executeTrade(request);

        // Same request replayed fails (nonces already used)
        vm.expectRevert(ISecondaryMarketEscrow.NonceAlreadyUsed.selector);
        escrow.executeTrade(request);
    }

    // ============ Transfer Failures ============

    function test_executeTrade_revertsOnInsufficientSellerBalance() public {
        // Burn seller's position tokens
        positionToken.burn(seller, positionToken.balanceOf(seller));

        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequest();

        vm.expectRevert();
        escrow.executeTrade(request);
    }

    function test_executeTrade_revertsOnInsufficientBuyerBalance() public {
        // Burn buyer's collateral
        collateralToken.burn(buyer, collateralToken.balanceOf(buyer));

        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequest();

        vm.expectRevert();
        escrow.executeTrade(request);
    }

    function test_executeTrade_revertsOnMissingSellerApproval() public {
        // Revoke seller approval
        vm.prank(seller);
        positionToken.approve(address(escrow), 0);

        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequest();

        vm.expectRevert();
        escrow.executeTrade(request);
    }

    function test_executeTrade_revertsOnMissingBuyerApproval() public {
        // Revoke buyer approval
        vm.prank(buyer);
        collateralToken.approve(address(escrow), 0);

        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequest();

        vm.expectRevert();
        escrow.executeTrade(request);
    }

    // ============ EIP-1271 Tests ============

    function test_executeTrade_smartAccountAsSeller() public {
        MockSmartAccountForTrade smartSeller =
            new MockSmartAccountForTrade(seller);

        // Fund and approve smart account
        positionToken.mint(address(smartSeller), 10_000e18);
        vm.prank(address(smartSeller));
        positionToken.approve(address(escrow), type(uint256).max);

        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequestWith(
                address(smartSeller),
                buyer,
                TOKEN_AMOUNT,
                PRICE,
                sellerPk,
                buyerPk
            );

        uint256 smartSellerPosBefore =
            positionToken.balanceOf(address(smartSeller));

        escrow.executeTrade(request);

        assertEq(
            positionToken.balanceOf(address(smartSeller)),
            smartSellerPosBefore - TOKEN_AMOUNT
        );
        assertEq(collateralToken.balanceOf(address(smartSeller)), PRICE);
        assertEq(positionToken.balanceOf(buyer), TOKEN_AMOUNT);
    }

    function test_executeTrade_smartAccountAsBuyer() public {
        MockSmartAccountForTrade smartBuyer =
            new MockSmartAccountForTrade(buyer);

        // Fund and approve smart account
        collateralToken.mint(address(smartBuyer), 10_000e18);
        vm.prank(address(smartBuyer));
        collateralToken.approve(address(escrow), type(uint256).max);

        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequestWith(
                seller,
                address(smartBuyer),
                TOKEN_AMOUNT,
                PRICE,
                sellerPk,
                buyerPk
            );

        escrow.executeTrade(request);

        assertEq(positionToken.balanceOf(address(smartBuyer)), TOKEN_AMOUNT);
        assertEq(collateralToken.balanceOf(seller), PRICE);
    }

    function test_executeTrade_bothSmartAccounts() public {
        MockSmartAccountForTrade smartSeller =
            new MockSmartAccountForTrade(seller);
        MockSmartAccountForTrade smartBuyer =
            new MockSmartAccountForTrade(buyer);

        // Fund and approve
        positionToken.mint(address(smartSeller), 10_000e18);
        collateralToken.mint(address(smartBuyer), 10_000e18);
        vm.prank(address(smartSeller));
        positionToken.approve(address(escrow), type(uint256).max);
        vm.prank(address(smartBuyer));
        collateralToken.approve(address(escrow), type(uint256).max);

        ISecondaryMarketEscrow.TradeRequest memory request =
            _createTradeRequestWith(
                address(smartSeller),
                address(smartBuyer),
                TOKEN_AMOUNT,
                PRICE,
                sellerPk,
                buyerPk
            );

        escrow.executeTrade(request);

        assertEq(positionToken.balanceOf(address(smartBuyer)), TOKEN_AMOUNT);
        assertEq(collateralToken.balanceOf(address(smartSeller)), PRICE);
    }

    function test_executeTrade_smartAccount_invalidSignature() public {
        MockSmartAccountForTrade smartSeller =
            new MockSmartAccountForTrade(seller);

        positionToken.mint(address(smartSeller), 10_000e18);
        vm.prank(address(smartSeller));
        positionToken.approve(address(escrow), type(uint256).max);

        // Sign with wrong key (buyerPk instead of sellerPk for smart account owner)
        bytes32 tradeHash = _computeTradeHash(
            address(positionToken),
            address(collateralToken),
            address(smartSeller),
            buyer,
            TOKEN_AMOUNT,
            PRICE
        );

        uint256 sNonce = _freshNonce();
        uint256 bNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        ISecondaryMarketEscrow.TradeRequest memory request;
        request.token = address(positionToken);
        request.collateral = address(collateralToken);
        request.seller = address(smartSeller);
        request.buyer = buyer;
        request.tokenAmount = TOKEN_AMOUNT;
        request.price = PRICE;
        request.sellerNonce = sNonce;
        request.buyerNonce = bNonce;
        request.sellerDeadline = deadline;
        request.buyerDeadline = deadline;
        request.sellerSignature = _signTradeApproval(
            tradeHash,
            address(smartSeller),
            sNonce,
            deadline,
            buyerPk // Wrong key!
        );
        request.buyerSignature =
            _signTradeApproval(tradeHash, buyer, bNonce, deadline, buyerPk);
        request.refCode = REF_CODE;
        request.sellerSessionKeyData = "";
        request.buyerSessionKeyData = "";

        vm.expectRevert(ISecondaryMarketEscrow.InvalidSignature.selector);
        escrow.executeTrade(request);
    }

    // ============ EIP-1271 Fallback via tryRecover ============

    /// @notice Regression: ECDSA.recover reverts on malformed sigs, preventing
    ///         the EIP-1271 fallback from ever being reached for smart accounts
    ///         that use non-standard signature formats. With tryRecover the
    ///         invalid ECDSA result is caught gracefully and the contract
    ///         code-length check + isValidSignature path executes.
    function test_executeTrade_smartAccount_eip1271_with_compact_signature()
        public
    {
        // Smart account whose owner is `seller` — supports compact sigs
        MockSmartAccountCompact smartSeller =
            new MockSmartAccountCompact(seller);

        positionToken.mint(address(smartSeller), 10_000e18);
        vm.prank(address(smartSeller));
        positionToken.approve(address(escrow), type(uint256).max);

        bytes32 tradeHash = _computeTradeHash(
            address(positionToken),
            address(collateralToken),
            address(smartSeller),
            buyer,
            TOKEN_AMOUNT,
            PRICE
        );

        uint256 sNonce = _freshNonce();
        uint256 bNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        // Build a 64-byte "compact" EIP-2098 signature. ECDSA.recover reverts
        // with ECDSAInvalidSignatureLength for non-65-byte sigs, but the smart
        // account's isValidSignature can still validate it. With tryRecover
        // the ECDSA path gracefully returns false and falls through to EIP-1271.
        bytes32 approvalHash = escrow.getTradeApprovalHash(
            tradeHash, address(smartSeller), sNonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sellerPk, approvalHash);

        // Pack into 64-byte compact form (EIP-2098): r ++ (s | (v-27)<<255)
        bytes32 vs = bytes32(uint256(s) | (uint256(v - 27) << 255));
        bytes memory compactSig = abi.encodePacked(r, vs);
        assert(compactSig.length == 64);

        ISecondaryMarketEscrow.TradeRequest memory request;
        request.token = address(positionToken);
        request.collateral = address(collateralToken);
        request.seller = address(smartSeller);
        request.buyer = buyer;
        request.tokenAmount = TOKEN_AMOUNT;
        request.price = PRICE;
        request.sellerNonce = sNonce;
        request.buyerNonce = bNonce;
        request.sellerDeadline = deadline;
        request.buyerDeadline = deadline;
        request.sellerSignature = compactSig; // 64 bytes — ECDSA.recover reverts
        request.buyerSignature =
            _signTradeApproval(tradeHash, buyer, bNonce, deadline, buyerPk);
        request.refCode = REF_CODE;
        request.sellerSessionKeyData = "";
        request.buyerSessionKeyData = "";

        // Before fix: reverts with ECDSAInvalidSignatureLength (never reaches EIP-1271)
        // After fix:  tryRecover returns error, falls through to EIP-1271, trade succeeds
        uint256 sellerPosBefore = positionToken.balanceOf(address(smartSeller));

        escrow.executeTrade(request);

        assertEq(
            positionToken.balanceOf(address(smartSeller)),
            sellerPosBefore - TOKEN_AMOUNT,
            "Seller position tokens should decrease"
        );
        assertEq(
            collateralToken.balanceOf(address(smartSeller)),
            PRICE,
            "Seller should receive collateral"
        );
        assertEq(
            positionToken.balanceOf(buyer),
            TOKEN_AMOUNT,
            "Buyer should receive position tokens"
        );
    }

    /// @notice Multisig seller: signature is abi.encode(bytes[]) which is not
    ///         a valid ECDSA sig at all. Before tryRecover fix this reverts;
    ///         after, it falls through to EIP-1271 and the multisig validates.
    function test_executeTrade_multisigSeller() public {
        // 2-of-3 multisig with seller, buyer, relayer as signers
        address[] memory signers = new address[](3);
        signers[0] = seller;
        signers[1] = buyer;
        signers[2] = relayer;
        MockMultisig multisig = new MockMultisig(signers, 2);

        // Fund and approve
        positionToken.mint(address(multisig), 10_000e18);
        vm.prank(address(multisig));
        positionToken.approve(address(escrow), type(uint256).max);

        bytes32 tradeHash = _computeTradeHash(
            address(positionToken),
            address(collateralToken),
            address(multisig),
            buyer,
            TOKEN_AMOUNT,
            PRICE
        );

        uint256 sNonce = _freshNonce();
        uint256 bNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        // Build multisig signature: 2 inner ECDSA sigs from seller + relayer
        bytes32 approvalHash = escrow.getTradeApprovalHash(
            tradeHash, address(multisig), sNonce, deadline
        );
        bytes[] memory innerSigs = new bytes[](2);
        // Must be in ascending address order for the mock's duplicate check
        if (seller < relayer) {
            (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(sellerPk, approvalHash);
            innerSigs[0] = abi.encodePacked(r1, s1, v1);
            (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(4, approvalHash); // relayer pk = 4
            innerSigs[1] = abi.encodePacked(r2, s2, v2);
        } else {
            (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(4, approvalHash);
            innerSigs[0] = abi.encodePacked(r2, s2, v2);
            (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(sellerPk, approvalHash);
            innerSigs[1] = abi.encodePacked(r1, s1, v1);
        }
        bytes memory multisigSig = abi.encode(innerSigs);

        ISecondaryMarketEscrow.TradeRequest memory request;
        request.token = address(positionToken);
        request.collateral = address(collateralToken);
        request.seller = address(multisig);
        request.buyer = buyer;
        request.tokenAmount = TOKEN_AMOUNT;
        request.price = PRICE;
        request.sellerNonce = sNonce;
        request.buyerNonce = bNonce;
        request.sellerDeadline = deadline;
        request.buyerDeadline = deadline;
        request.sellerSignature = multisigSig; // Not ECDSA — will fail recover
        request.buyerSignature =
            _signTradeApproval(tradeHash, buyer, bNonce, deadline, buyerPk);
        request.refCode = REF_CODE;
        request.sellerSessionKeyData = "";
        request.buyerSessionKeyData = "";

        // Before fix: reverts in ECDSA.recover (multisig sig is not 65 bytes)
        // After fix: tryRecover returns error, falls through to EIP-1271, multisig validates 2-of-3
        uint256 sellerPosBefore = positionToken.balanceOf(address(multisig));

        escrow.executeTrade(request);

        assertEq(
            positionToken.balanceOf(address(multisig)),
            sellerPosBefore - TOKEN_AMOUNT,
            "Multisig position tokens should decrease"
        );
        assertEq(
            collateralToken.balanceOf(address(multisig)),
            PRICE,
            "Multisig should receive collateral"
        );
        assertEq(
            positionToken.balanceOf(buyer),
            TOKEN_AMOUNT,
            "Buyer should receive position tokens"
        );
    }

    /// @notice Multisig seller with insufficient signers should still revert
    function test_executeTrade_multisigSeller_insufficientSigners() public {
        address[] memory signers = new address[](3);
        signers[0] = seller;
        signers[1] = buyer;
        signers[2] = relayer;
        MockMultisig multisig = new MockMultisig(signers, 2);

        positionToken.mint(address(multisig), 10_000e18);
        vm.prank(address(multisig));
        positionToken.approve(address(escrow), type(uint256).max);

        bytes32 tradeHash = _computeTradeHash(
            address(positionToken),
            address(collateralToken),
            address(multisig),
            buyer,
            TOKEN_AMOUNT,
            PRICE
        );

        uint256 sNonce = _freshNonce();
        uint256 bNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        // Only 1 signer — below threshold of 2
        bytes32 approvalHash = escrow.getTradeApprovalHash(
            tradeHash, address(multisig), sNonce, deadline
        );
        bytes[] memory innerSigs = new bytes[](1);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(sellerPk, approvalHash);
        innerSigs[0] = abi.encodePacked(r1, s1, v1);
        bytes memory multisigSig = abi.encode(innerSigs);

        ISecondaryMarketEscrow.TradeRequest memory request;
        request.token = address(positionToken);
        request.collateral = address(collateralToken);
        request.seller = address(multisig);
        request.buyer = buyer;
        request.tokenAmount = TOKEN_AMOUNT;
        request.price = PRICE;
        request.sellerNonce = sNonce;
        request.buyerNonce = bNonce;
        request.sellerDeadline = deadline;
        request.buyerDeadline = deadline;
        request.sellerSignature = multisigSig;
        request.buyerSignature =
            _signTradeApproval(tradeHash, buyer, bNonce, deadline, buyerPk);
        request.refCode = REF_CODE;
        request.sellerSessionKeyData = "";
        request.buyerSessionKeyData = "";

        vm.expectRevert(ISecondaryMarketEscrow.InvalidSignature.selector);
        escrow.executeTrade(request);
    }

    // ============ View Functions ============

    function test_domainSeparator_nonZero() public view {
        assertTrue(escrow.domainSeparator() != bytes32(0));
    }

    function test_getTradeApprovalHash_deterministic() public view {
        bytes32 tradeHash = keccak256("test");
        bytes32 hash1 = escrow.getTradeApprovalHash(tradeHash, seller, 0, 1000);
        bytes32 hash2 = escrow.getTradeApprovalHash(tradeHash, seller, 0, 1000);
        assertEq(hash1, hash2);
    }

    function test_getTradeApprovalHash_differentForDifferentParams()
        public
        view
    {
        bytes32 tradeHash = keccak256("test");
        bytes32 hash1 = escrow.getTradeApprovalHash(tradeHash, seller, 0, 1000);
        bytes32 hash2 = escrow.getTradeApprovalHash(tradeHash, seller, 1, 1000);
        assertTrue(hash1 != hash2);
    }
}

// ============ Session Key Tests ============

contract SecondaryMarketEscrowSessionKeyTest is Test {
    SecondaryMarketEscrow public escrow;
    MockERC20 public positionToken;
    MockERC20 public collateralToken;
    MockAccountFactory public factory;

    uint256 public ownerPk;
    address public owner;
    uint256 public sessionKeyPk;
    address public sessionKey;

    uint256 private _nextNonce = 1;

    function _freshNonce() internal returns (uint256) {
        return _nextNonce++;
    }
    uint256 public buyerPk;
    address public buyer;
    address public smartAccount;

    uint256 public constant TOKEN_AMOUNT = 100e18;
    uint256 public constant PRICE = 50e18;
    bytes32 public constant REF_CODE = keccak256("test-ref");

    function setUp() public {
        ownerPk = 10;
        owner = vm.addr(ownerPk);
        sessionKeyPk = 11;
        sessionKey = vm.addr(sessionKeyPk);
        buyerPk = 12;
        buyer = vm.addr(buyerPk);
        smartAccount = address(0xBEEF);

        factory = new MockAccountFactory();
        factory.setAccount(owner, 0, smartAccount);

        escrow = new SecondaryMarketEscrow(address(factory));
        positionToken = new MockERC20("Position Token", "POS", 18);
        collateralToken = new MockERC20("Collateral", "USDE", 18);

        // Fund accounts
        positionToken.mint(smartAccount, 10_000e18);
        collateralToken.mint(buyer, 10_000e18);

        // Approvals
        vm.prank(smartAccount);
        positionToken.approve(address(escrow), type(uint256).max);
        vm.prank(buyer);
        collateralToken.approve(address(escrow), type(uint256).max);
    }

    function _computeTradeHash() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                address(positionToken),
                address(collateralToken),
                smartAccount,
                buyer,
                TOKEN_AMOUNT,
                PRICE
            )
        );
    }

    function _signTradeApproval(
        bytes32 tradeHash,
        address signer,
        uint256 nonce,
        uint256 deadline,
        uint256 pk
    ) internal view returns (bytes memory) {
        bytes32 approvalHash = escrow.getTradeApprovalHash(
            tradeHash, signer, nonce, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, approvalHash);
        return abi.encodePacked(r, s, v);
    }

    function _createSessionKeyData() internal view returns (bytes memory) {
        uint256 validUntil = block.timestamp + 1 days;
        bytes32 permissionsHash = keccak256("TRADE");

        // Owner signs session key approval
        bytes32 sessionApprovalHash = escrow.getSessionKeyApprovalHash(
            sessionKey, smartAccount, validUntil, permissionsHash, block.chainid
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, sessionApprovalHash);
        bytes memory ownerSig = abi.encodePacked(r, s, v);

        IV2Types.SessionKeyData memory skData = IV2Types.SessionKeyData({
            sessionKey: sessionKey,
            owner: owner,
            validUntil: validUntil,
            permissionsHash: permissionsHash,
            chainId: block.chainid,
            ownerSignature: ownerSig
        });

        return abi.encode(skData);
    }

    function test_executeTrade_withSessionKeySeller() public {
        bytes32 tradeHash = _computeTradeHash();
        uint256 sNonce = _freshNonce();
        uint256 bNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        // Session key signs the trade approval for smart account
        bytes memory sellerSig = _signTradeApproval(
            tradeHash, smartAccount, sNonce, deadline, sessionKeyPk
        );
        bytes memory buyerSig =
            _signTradeApproval(tradeHash, buyer, bNonce, deadline, buyerPk);

        ISecondaryMarketEscrow.TradeRequest memory request;
        request.token = address(positionToken);
        request.collateral = address(collateralToken);
        request.seller = smartAccount;
        request.buyer = buyer;
        request.tokenAmount = TOKEN_AMOUNT;
        request.price = PRICE;
        request.sellerNonce = sNonce;
        request.buyerNonce = bNonce;
        request.sellerDeadline = deadline;
        request.buyerDeadline = deadline;
        request.sellerSignature = sellerSig;
        request.buyerSignature = buyerSig;
        request.refCode = REF_CODE;
        request.sellerSessionKeyData = _createSessionKeyData();
        request.buyerSessionKeyData = "";

        uint256 smartAccountPosBefore = positionToken.balanceOf(smartAccount);

        escrow.executeTrade(request);

        assertEq(
            positionToken.balanceOf(smartAccount),
            smartAccountPosBefore - TOKEN_AMOUNT
        );
        assertEq(collateralToken.balanceOf(smartAccount), PRICE);
        assertEq(positionToken.balanceOf(buyer), TOKEN_AMOUNT);
    }

    function test_executeTrade_sessionKey_expiredSession() public {
        bytes32 tradeHash = _computeTradeHash();
        uint256 sNonce = _freshNonce();
        uint256 bNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory sellerSig = _signTradeApproval(
            tradeHash, smartAccount, sNonce, deadline, sessionKeyPk
        );
        bytes memory buyerSig =
            _signTradeApproval(tradeHash, buyer, bNonce, deadline, buyerPk);

        // Create session key data with expired validUntil
        uint256 validUntil = block.timestamp - 1;
        bytes32 permissionsHash = keccak256("TRADE");

        bytes32 sessionApprovalHash = escrow.getSessionKeyApprovalHash(
            sessionKey, smartAccount, validUntil, permissionsHash, block.chainid
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, sessionApprovalHash);
        bytes memory ownerSig = abi.encodePacked(r, s, v);

        IV2Types.SessionKeyData memory skData = IV2Types.SessionKeyData({
            sessionKey: sessionKey,
            owner: owner,
            validUntil: validUntil,
            permissionsHash: permissionsHash,
            chainId: block.chainid,
            ownerSignature: ownerSig
        });

        ISecondaryMarketEscrow.TradeRequest memory request;
        request.token = address(positionToken);
        request.collateral = address(collateralToken);
        request.seller = smartAccount;
        request.buyer = buyer;
        request.tokenAmount = TOKEN_AMOUNT;
        request.price = PRICE;
        request.sellerNonce = sNonce;
        request.buyerNonce = bNonce;
        request.sellerDeadline = deadline;
        request.buyerDeadline = deadline;
        request.sellerSignature = sellerSig;
        request.buyerSignature = buyerSig;
        request.refCode = REF_CODE;
        request.sellerSessionKeyData = abi.encode(skData);
        request.buyerSessionKeyData = "";

        vm.expectRevert(ISecondaryMarketEscrow.InvalidSignature.selector);
        escrow.executeTrade(request);
    }

    function test_executeTrade_sessionKey_wrongChainId() public {
        bytes32 tradeHash = _computeTradeHash();
        uint256 sNonce = _freshNonce();
        uint256 bNonce = _freshNonce();
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory sellerSig = _signTradeApproval(
            tradeHash, smartAccount, sNonce, deadline, sessionKeyPk
        );
        bytes memory buyerSig =
            _signTradeApproval(tradeHash, buyer, bNonce, deadline, buyerPk);

        // Create session key data with wrong chain ID
        uint256 validUntil = block.timestamp + 1 days;
        bytes32 permissionsHash = keccak256("TRADE");
        uint256 wrongChainId = 999;

        bytes32 sessionApprovalHash = escrow.getSessionKeyApprovalHash(
            sessionKey, smartAccount, validUntil, permissionsHash, wrongChainId
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, sessionApprovalHash);
        bytes memory ownerSig = abi.encodePacked(r, s, v);

        IV2Types.SessionKeyData memory skData = IV2Types.SessionKeyData({
            sessionKey: sessionKey,
            owner: owner,
            validUntil: validUntil,
            permissionsHash: permissionsHash,
            chainId: wrongChainId,
            ownerSignature: ownerSig
        });

        ISecondaryMarketEscrow.TradeRequest memory request;
        request.token = address(positionToken);
        request.collateral = address(collateralToken);
        request.seller = smartAccount;
        request.buyer = buyer;
        request.tokenAmount = TOKEN_AMOUNT;
        request.price = PRICE;
        request.sellerNonce = sNonce;
        request.buyerNonce = bNonce;
        request.sellerDeadline = deadline;
        request.buyerDeadline = deadline;
        request.sellerSignature = sellerSig;
        request.buyerSignature = buyerSig;
        request.refCode = REF_CODE;
        request.sellerSessionKeyData = abi.encode(skData);
        request.buyerSessionKeyData = "";

        vm.expectRevert(ISecondaryMarketEscrow.InvalidSignature.selector);
        escrow.executeTrade(request);
    }

    function _signRaw(uint256 pk, bytes32 hash)
        internal
        pure
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, hash);
        return abi.encodePacked(r, s, v);
    }

    function test_executeTrade_sessionKey_noAccountFactory() public {
        // Deploy escrow without account factory
        SecondaryMarketEscrow escrowNoFactory =
            new SecondaryMarketEscrow(address(0));

        vm.prank(smartAccount);
        positionToken.approve(address(escrowNoFactory), type(uint256).max);
        vm.prank(buyer);
        collateralToken.approve(address(escrowNoFactory), type(uint256).max);

        bytes32 tradeHash = keccak256(
            abi.encode(
                address(positionToken),
                address(collateralToken),
                smartAccount,
                buyer,
                TOKEN_AMOUNT,
                PRICE
            )
        );

        uint256 deadline = block.timestamp + 1 hours;

        bytes memory sellerSig = _signRaw(
            sessionKeyPk,
            escrowNoFactory.getTradeApprovalHash(
                tradeHash, smartAccount, 0, deadline
            )
        );
        bytes memory buyerSig = _signRaw(
            buyerPk,
            escrowNoFactory.getTradeApprovalHash(tradeHash, buyer, 0, deadline)
        );

        // Create session key data
        bytes memory sessionKeyData;
        {
            uint256 validUntil = block.timestamp + 1 days;
            bytes32 permissionsHash = keccak256("TRADE");
            bytes memory ownerSig = _signRaw(
                ownerPk,
                escrowNoFactory.getSessionKeyApprovalHash(
                    sessionKey,
                    smartAccount,
                    validUntil,
                    permissionsHash,
                    block.chainid
                )
            );
            sessionKeyData = abi.encode(
                IV2Types.SessionKeyData({
                    sessionKey: sessionKey,
                    owner: owner,
                    validUntil: validUntil,
                    permissionsHash: permissionsHash,
                    chainId: block.chainid,
                    ownerSignature: ownerSig
                })
            );
        }

        ISecondaryMarketEscrow.TradeRequest memory request;
        request.token = address(positionToken);
        request.collateral = address(collateralToken);
        request.seller = smartAccount;
        request.buyer = buyer;
        request.tokenAmount = TOKEN_AMOUNT;
        request.price = PRICE;
        request.sellerNonce = 0;
        request.buyerNonce = 0;
        request.sellerDeadline = deadline;
        request.buyerDeadline = deadline;
        request.sellerSignature = sellerSig;
        request.buyerSignature = buyerSig;
        request.refCode = REF_CODE;
        request.sellerSessionKeyData = sessionKeyData;
        request.buyerSessionKeyData = "";

        vm.expectRevert(ISecondaryMarketEscrow.AccountFactoryNotSet.selector);
        escrowNoFactory.executeTrade(request);
    }
}
