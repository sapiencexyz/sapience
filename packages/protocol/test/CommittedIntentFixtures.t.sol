// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import { ICommittedIntent } from "../src/interfaces/ICommittedIntent.sol";

/**
 * @title CommittedIntentFixtures
 * @notice Emits the canonical golden fixture for the committed-intent EIP-712
 *         vector (prd-001-spec-0.1-canonical.md §2.4) and writes a JSON file
 *         to `packages/sdk/__fixtures__/committedIntent.golden.json`.
 *         Fase 2 SDK tests load this JSON and assert their off-chain hashing
 *         matches exactly.
 */
contract CommittedIntentFixturesTest is Test {
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 internal constant DOMAIN_NAME_HASH =
        keccak256("SapienceCommittedIntent");
    bytes32 internal constant DOMAIN_VERSION_HASH = keccak256("1");
    bytes32 internal constant COMMITMENT_TYPEHASH = keccak256(
        "Commitment(address predictor,uint64 predictorWindowEnd,uint64 deadline,bytes32 pickConfigId,uint256 amountIn,uint256 minFillIn,uint256 minAmountOut,uint256 executorTip,uint256 nonce)"
    );
    bytes32 internal constant QUOTE_TYPEHASH = keccak256(
        "Quote(address counterparty,uint64 deadline,bytes32 commitmentHash,uint256 maxIn,uint256 amountOut,uint256 nonce)"
    );

    // Golden vector constants (kept in contract storage-less slots).
    uint256 internal constant CHAIN_ID = 8453;
    address internal constant VERIFYING_CONTRACT =
        address(0x00000000000000000000000000000000000000C1);

    address internal constant PREDICTOR = address(uint160(0xF101));
    uint64 internal constant PREDICTOR_WINDOW_END = 1_800_000_060;
    uint64 internal constant DEADLINE_VAL = 1_800_000_120;
    bytes32 internal constant PICK_CONFIG_ID = bytes32(
        uint256(
            0x1111111111111111111111111111111111111111111111111111111111111111
        )
    );
    uint256 internal constant AMOUNT_IN = 100e18;
    uint256 internal constant MIN_FILL_IN = 60e18;
    uint256 internal constant MIN_AMOUNT_OUT = 150e18;
    uint256 internal constant EXECUTOR_TIP = 1e18;
    uint256 internal constant C_NONCE = 42;

    address internal constant COUNTERPARTY = address(uint160(0xCA01));
    uint64 internal constant Q_DEADLINE = 1_800_000_100;
    uint256 internal constant MAX_IN = 100e18;
    uint256 internal constant AMOUNT_OUT = 200e18;
    uint256 internal constant Q_NONCE = 7;

    function _domainSeparator() internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                DOMAIN_NAME_HASH,
                DOMAIN_VERSION_HASH,
                CHAIN_ID,
                VERIFYING_CONTRACT
            )
        );
    }

    function _commitmentHashLocal() internal pure returns (bytes32) {
        bytes32 s = keccak256(
            abi.encode(
                COMMITMENT_TYPEHASH,
                PREDICTOR,
                uint256(PREDICTOR_WINDOW_END),
                uint256(DEADLINE_VAL),
                PICK_CONFIG_ID,
                AMOUNT_IN,
                MIN_FILL_IN,
                MIN_AMOUNT_OUT,
                EXECUTOR_TIP,
                C_NONCE
            )
        );
        return
            keccak256(abi.encodePacked(bytes2(0x1901), _domainSeparator(), s));
    }

    function _quoteHashLocal(bytes32 cHash_) internal pure returns (bytes32) {
        bytes32 s = keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                COUNTERPARTY,
                uint256(Q_DEADLINE),
                cHash_,
                MAX_IN,
                AMOUNT_OUT,
                Q_NONCE
            )
        );
        return
            keccak256(abi.encodePacked(bytes2(0x1901), _domainSeparator(), s));
    }

    function test_emitGoldenFixture() public {
        bytes32 dom = _domainSeparator();
        bytes32 cHash = _commitmentHashLocal();
        bytes32 qHash = _quoteHashLocal(cHash);

        console.log("chainId:", CHAIN_ID);
        console.log("verifyingContract:", VERIFYING_CONTRACT);
        console.log("domainSeparator:");
        console.logBytes32(dom);
        console.log("COMMITMENT_TYPEHASH:");
        console.logBytes32(COMMITMENT_TYPEHASH);
        console.log("QUOTE_TYPEHASH:");
        console.logBytes32(QUOTE_TYPEHASH);
        console.log("commitmentHash:");
        console.logBytes32(cHash);
        console.log("quoteHash:");
        console.logBytes32(qHash);

        string memory json = _buildJson(dom, cHash, qHash);
        vm.writeFile("../sdk/__fixtures__/committedIntent.golden.json", json);
    }

    function _buildJson(bytes32 dom, bytes32 cHash, bytes32 qHash)
        internal
        view
        returns (string memory)
    {
        string memory header = _headerJson(dom);
        string memory cmt = _commitmentJson();
        string memory cmtTail = string(
            abi.encodePacked(
                '  "commitmentHash": "', vm.toString(cHash), '",\n'
            )
        );
        string memory qt = _quoteJson(cHash);
        string memory qtTail = string(
            abi.encodePacked(
                '  "quoteHash": "', vm.toString(qHash), '"\n', "}\n"
            )
        );
        return string(abi.encodePacked(header, cmt, cmtTail, qt, qtTail));
    }

    function _headerJson(bytes32 dom) internal view returns (string memory) {
        return string(
            abi.encodePacked(
                "{\n",
                '  "chainId": 8453,\n',
                '  "verifyingContract": "',
                vm.toString(VERIFYING_CONTRACT),
                '",\n',
                '  "domainSeparator": "',
                vm.toString(dom),
                '",\n',
                '  "commitmentTypehash": "',
                vm.toString(COMMITMENT_TYPEHASH),
                '",\n',
                '  "quoteTypehash": "',
                vm.toString(QUOTE_TYPEHASH),
                '",\n'
            )
        );
    }

    function _kv(string memory key, string memory value)
        internal
        pure
        returns (string memory)
    {
        return string(abi.encodePacked('    "', key, '": "', value, '",\n'));
    }

    function _kvLast(string memory key, string memory value)
        internal
        pure
        returns (string memory)
    {
        return string(abi.encodePacked('    "', key, '": "', value, '"\n'));
    }

    function _commitmentJson() internal view returns (string memory) {
        string memory a = string(
            abi.encodePacked(
                '  "commitment": {\n',
                _kv("predictor", vm.toString(PREDICTOR)),
                _kv(
                    "predictorWindowEnd",
                    vm.toString(uint256(PREDICTOR_WINDOW_END))
                ),
                _kv("deadline", vm.toString(uint256(DEADLINE_VAL)))
            )
        );
        string memory b = string(
            abi.encodePacked(
                _kv("pickConfigId", vm.toString(PICK_CONFIG_ID)),
                _kv("amountIn", vm.toString(AMOUNT_IN)),
                _kv("minFillIn", vm.toString(MIN_FILL_IN)),
                _kv("minAmountOut", vm.toString(MIN_AMOUNT_OUT))
            )
        );
        string memory c = string(
            abi.encodePacked(
                _kv("executorTip", vm.toString(EXECUTOR_TIP)),
                _kvLast("nonce", vm.toString(C_NONCE)),
                "  },\n"
            )
        );
        return string(abi.encodePacked(a, b, c));
    }

    function _quoteJson(bytes32 cHash) internal view returns (string memory) {
        string memory a = string(
            abi.encodePacked(
                '  "quote": {\n',
                _kv("counterparty", vm.toString(COUNTERPARTY)),
                _kv("deadline", vm.toString(uint256(Q_DEADLINE)))
            )
        );
        string memory b = string(
            abi.encodePacked(
                _kv("commitmentHash", vm.toString(cHash)),
                _kv("maxIn", vm.toString(MAX_IN)),
                _kv("amountOut", vm.toString(AMOUNT_OUT))
            )
        );
        string memory c = string(
            abi.encodePacked(_kvLast("nonce", vm.toString(Q_NONCE)), "  },\n")
        );
        return string(abi.encodePacked(a, b, c));
    }
}
