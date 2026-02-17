// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "forge-std/StdJson.sol";

import "../../src/predictionMarket/resolvers/PythResolver.sol";
import "../../src/predictionMarket/resolvers/pythLazer/IPythLazer.sol";
import "../../src/predictionMarket/resolvers/pythLazer/PythLazerLib.sol";
import "../../src/predictionMarket/resolvers/pythLazer/PythLazerLibBytes.sol";
import "../../src/predictionMarket/resolvers/pythLazer/PythLazerStructs.sol";

/// @notice Ethereal fork/e2e test for the Pyth Lazer-based resolver.
/// @dev This test is **opt-in** and will be skipped unless `RUN_PYTH_ETHEREAL_FORK_TESTS=true`.
contract PythResolverEtherealForkTest is Test {
    using stdJson for string;

    string internal constant DEFAULT_ETHEREAL_RPC = "https://rpc.ethereal.trade";
    string internal constant DEFAULT_PYTH_LAZER_BASE = "https://pyth-lazer.dourolabs.app";

    // Deployed PythLazer verifier on Ethereal (provided by user).
    address internal constant ETHEREAL_PYTH_LAZER_VERIFIER =
        0x486908B534E34D1Ca04d12F01b5Bf47aC62A68F5;

    function _requireUint64(uint256 v, string memory label) private pure returns (uint64) {
        require(v <= type(uint64).max, label);
        return uint64(v);
    }

    function _fetchUpdateFromHttpsEndpoint(
        string memory token,
        uint64 timestampUs,
        uint32 feedId,
        string memory channel,
        string memory baseUrl
    ) internal returns (bytes memory updateBlob) {
        // This uses Foundry FFI to call curl + node to return a tiny JSON object:
        //   { "evm": { "data": "0x..." } }
        // so StdJson can parse it as bytes.
        //
        // Requires running forge with: `--ffi`
        // And a valid token: `PYTH_LAZER_TOKEN`

        string memory feedList = vm.toString(uint256(feedId));

        string memory url = string.concat(baseUrl, "/v1/price");

        // Build a JSON body matching the "Pyth Lazer Price HTTPS Endpoint Guide".
        // We request `jsonBinaryEncoding=hex` so `evm.data` is hex and we can prepend 0x.
        string memory body = string.concat(
            '{"timestamp":',
            vm.toString(uint256(timestampUs)),
            ',"priceFeedIds":[',
            feedList,
            '],"properties":["price","exponent"],"formats":["evm"],"channel":"',
            channel,
            '","jsonBinaryEncoding":"hex"}'
        );

        string[] memory cmd = new string[](6);
        cmd[0] = "bash";
        cmd[1] = "-lc";
        cmd[2] = string.concat(
            "curl -sS -X POST ",
            "-H 'content-type: application/json' ",
            "-H \"Authorization: Bearer ",
            token,
            "\" ",
            "--data '",
            body,
            "' ",
            "\"",
            url,
            "\"",
            " | node -e \"const fs=require('fs');const j=JSON.parse(fs.readFileSync(0,'utf8'));const d=(j.evm&&j.evm.data||'').trim();const hex=(d.startsWith('0x')?d:('0x'+d));process.stdout.write(JSON.stringify({evm:{data:hex}}));\""
        );
        cmd[3] = "true"; // no-op arg to keep bash happy if needed
        cmd[4] = "true";
        cmd[5] = "true";

        bytes memory out = vm.ffi(cmd);
        string memory json = string(out);
        updateBlob = json.readBytes(".evm.data");
        require(updateBlob.length > 0, "empty update blob");
    }

    function _decodePriceExpoFromVerifiedPayload(
        bytes memory payload,
        uint32 feedId
    ) internal pure returns (int64 price, int32 expo) {
        PythLazerStructs.Update memory u = PythLazerLibBytes
            .parseUpdateFromPayloadBytes(payload);
        (PythLazerStructs.Feed memory feed, bool found) = _findFeed(u, feedId);
        require(found, "feed not found");
        price = PythLazerLib.getPrice(feed);
        expo = int32(PythLazerLib.getExponent(feed));
    }

    function _settleSingleMarket(
        IPythLazer lazer,
        uint256 fee,
        bytes memory updateBlob,
        uint64 endTime,
        uint32 feedId
    ) internal {
        // Deploy resolver configured for Ethereal Lazer verifier and settle the market.
        PythResolver.Settings memory settings = PythResolver.Settings({
            maxPredictionMarkets: 1,
            pythLazer: lazer
        });
        PythResolver resolver = new PythResolver(settings);

        bytes[] memory updateData = new bytes[](1);
        updateData[0] = updateBlob;

        vm.warp(endTime);

        // Verify once to get the payload for strike expo.
        (bytes memory payload, ) = lazer.verifyUpdate{value: fee}(updateBlob);
        (int64 price, int32 expo) = _decodePriceExpoFromVerifiedPayload(
            payload,
            feedId
        );

        PythResolver.BinaryOptionMarket memory market = PythResolver
            .BinaryOptionMarket({
                priceId: bytes32(uint256(feedId)),
                endTime: endTime,
                strikePrice: price - 1,
                strikeExpo: expo,
                overWinsOnTie: true
            });

        (bytes32 marketId, bool resolvedToOver) = resolver.settleMarket{value: fee}(
            market,
            updateData
        );
        assertTrue(resolvedToOver);
        (bool settled, , , , uint64 publishTime) = resolver.settlements(marketId);
        assertTrue(settled);
        assertEq(publishTime, endTime);
    }

    function _settleSingleMarketExternal(
        bytes calldata updateBlob,
        uint64 endTime,
        uint32 feedId
    ) external {
        IPythLazer lazer = IPythLazer(ETHEREAL_PYTH_LAZER_VERIFIER);
        uint256 fee = lazer.verification_fee();
        _settleSingleMarket(lazer, fee, updateBlob, endTime, feedId);
    }

    function _logVerifierDiagnostics(bytes memory fetchedBlob) internal returns (address recovered) {
        recovered = _recoverSignerFromUpdate(fetchedBlob);
        emit log_named_bytes("https update evm blob", fetchedBlob);
        emit log_named_address("https update recovered signer", recovered);
        emit log_named_address("ethereal lazer verifier", ETHEREAL_PYTH_LAZER_VERIFIER);

        (bool ownerOk, address owner) = _probeOwner(ETHEREAL_PYTH_LAZER_VERIFIER);
        if (ownerOk) emit log_named_address("verifier owner()", owner);
        else emit log_string("verifier owner() not readable");

        (bool trustOk, bool isTrusted, string memory trustMethod) = _probeIsTrustedSigner(
            ETHEREAL_PYTH_LAZER_VERIFIER,
            recovered
        );
        if (trustOk) {
            emit log_string(
                string.concat(
                    "verifier ",
                    trustMethod,
                    " => ",
                    isTrusted ? "true" : "false"
                )
            );
        } else {
            emit log_string("verifier trust check not readable (no isTrusted* view)");
        }

        (bool expOk, uint256 expiresAt, string memory expMethod) = _probeTrustedSignerExpiry(
            ETHEREAL_PYTH_LAZER_VERIFIER,
            recovered
        );
        if (expOk) {
            emit log_string(
                string.concat(
                    "verifier ",
                    expMethod,
                    " => expiresAt=",
                    vm.toString(expiresAt)
                )
            );
        } else {
            emit log_string("verifier expiry not readable (no trustedSigners* view)");
        }
    }

    function _readU16BE(bytes memory b, uint256 pos) private pure returns (uint16 v) {
        require(pos + 2 <= b.length, "oob");
        uint256 w;
        assembly {
            w := mload(add(add(b, 0x20), pos))
        }
        v = uint16(w >> 240);
    }

    function _readBytes32(bytes memory b, uint256 pos) private pure returns (bytes32 v) {
        require(pos + 32 <= b.length, "oob");
        assembly {
            v := mload(add(add(b, 0x20), pos))
        }
    }

    function _readU8(bytes memory b, uint256 pos) private pure returns (uint8 v) {
        require(pos + 1 <= b.length, "oob");
        assembly {
            v := byte(0, mload(add(add(b, 0x20), pos)))
        }
    }

    function _recoverSignerFromUpdate(bytes memory update) private pure returns (address signer) {
        require(update.length >= 71, "input too short");

        // Layout per upstream `PythLazer.verifyUpdate`:
        // [0:4] magic
        // [4:36] r
        // [36:68] s
        // [68] v (0/1)
        // [69:71] payload_len (uint16)
        // [71:71+payload_len] payload
        bytes32 r = _readBytes32(update, 4);
        bytes32 s = _readBytes32(update, 36);
        uint8 v = _readU8(update, 68) + 27;
        uint16 payloadLen = _readU16BE(update, 69);
        require(update.length >= 71 + payloadLen, "input too short");

        bytes32 hash;
        assembly {
            hash := keccak256(add(add(update, 0x20), 71), payloadLen)
        }

        signer = ecrecover(hash, v, r, s);
    }

    function _findFeed(
        PythLazerStructs.Update memory u,
        uint32 feedId
    ) internal pure returns (PythLazerStructs.Feed memory feed, bool found) {
        for (uint256 i = 0; i < u.feeds.length; i++) {
            if (u.feeds[i].feedId == feedId) {
                return (u.feeds[i], true);
            }
        }
        return (feed, false);
    }

    function _probeOwner(address lazer) internal view returns (bool ok, address owner) {
        bytes memory ret;
        (ok, ret) = lazer.staticcall(
            abi.encodeWithSelector(bytes4(keccak256("owner()")))
        );
        if (!ok || ret.length < 32) return (false, address(0));
        owner = abi.decode(ret, (address));
        return (true, owner);
    }

    function _probeTrustedSignerExpiry(
        address lazer,
        address signer
    ) internal view returns (bool ok, uint256 expiresAt, string memory method) {
        bytes4[3] memory sels = [
            bytes4(keccak256("trustedSigners(address)")),
            bytes4(keccak256("trustedSignerExpiresAt(address)")),
            bytes4(keccak256("trustedSignerExpirations(address)"))
        ];
        string[3] memory names = [
            "trustedSigners(address)",
            "trustedSignerExpiresAt(address)",
            "trustedSignerExpirations(address)"
        ];

        for (uint256 i = 0; i < sels.length; i++) {
            bool okCall;
            bytes memory ret;
            (okCall, ret) = lazer.staticcall(
                abi.encodeWithSelector(sels[i], signer)
            );
            if (okCall && ret.length >= 32) {
                expiresAt = abi.decode(ret, (uint256));
                return (true, expiresAt, names[i]);
            }
        }
        return (false, 0, "");
    }

    function _probeIsTrustedSigner(
        address lazer,
        address signer
    ) internal view returns (bool ok, bool isTrusted, string memory method) {
        bytes4[2] memory sels = [
            bytes4(keccak256("isTrustedSigner(address)")),
            bytes4(keccak256("isTrusted(address)"))
        ];
        string[2] memory names = [
            "isTrustedSigner(address)",
            "isTrusted(address)"
        ];

        for (uint256 i = 0; i < sels.length; i++) {
            bool okCall;
            bytes memory ret;
            (okCall, ret) = lazer.staticcall(
                abi.encodeWithSelector(sels[i], signer)
            );
            if (okCall && ret.length >= 32) {
                isTrusted = abi.decode(ret, (bool));
                return (true, isTrusted, names[i]);
            }
        }
        return (false, false, "");
    }

    /// @notice End-to-end fork test that fetches the signed update blob from the HTTPS endpoint.
    /// @dev This test intentionally does NOT call `updateTrustedSigner`. If the signer returned by
    ///      the HTTPS API is not trusted by the Ethereal verifier, `verifyUpdate` will revert with
    ///      `invalid signer` (which matches production behavior).
    ///
    /// Run:
    ///   RUN_PYTH_ETHEREAL_FORK_TESTS=true \
    ///   PYTH_LAZER_TOKEN=... \
    ///   PYTH_LAZER_TIMESTAMP_US=... \
    ///   forge test --ffi \
    ///     --match-path test/predictionMarket/PythResolverEtherealFork.t.sol -vvv
    function test_e2e_etherealFork_settleMarket_fetchFromHttps_withoutWhitelisting() public {
        bool runFork = vm.envOr("RUN_PYTH_ETHEREAL_FORK_TESTS", false);
        if (!runFork) vm.skip(true);

        string memory token = vm.envOr("PYTH_LAZER_TOKEN", string(""));
        if (bytes(token).length == 0) vm.skip(true);

        // Require a deterministic timestamp from env so this test is fully driven by HTTPS fetches
        // and does not rely on any hardcoded sample blob.
        uint256 tsEnv = vm.envOr("PYTH_LAZER_TIMESTAMP_US", uint256(0));
        if (tsEnv == 0) vm.skip(true);
        uint64 timestampUs = _requireUint64(tsEnv, "timestamp too large");

        // Fork Ethereal
        {
            string memory rpc = vm.envOr("ETHEREAL_RPC", DEFAULT_ETHEREAL_RPC);
            uint256 forkBlock = vm.envOr("ETHEREAL_FORK_BLOCK", uint256(0));
            if (forkBlock != 0) {
                vm.createSelectFork(rpc, forkBlock);
            } else {
                vm.createSelectFork(rpc);
            }
        }

        if (ETHEREAL_PYTH_LAZER_VERIFIER.code.length == 0) {
            vm.skip(true);
        }

        // Resolver requires exact second alignment.
        assertEq(uint256(timestampUs) % 1_000_000, 0, "timestamp not second-aligned");
        uint64 endTime = uint64(timestampUs / 1_000_000);

        // Fetch a fresh signed blob for the same timestamp.
        string memory baseUrl = vm.envOr("PYTH_LAZER_BASE_URL", DEFAULT_PYTH_LAZER_BASE);
        uint32 feedId = uint32(vm.envOr("PYTH_LAZER_FEED_ID", uint256(1)));
        string memory channel = vm.envOr("PYTH_LAZER_CHANNEL", string("fixed_rate@50ms"));
        bytes memory fetchedBlob = _fetchUpdateFromHttpsEndpoint(
            token,
            timestampUs,
            feedId,
            channel,
            baseUrl
        );

        vm.deal(address(this), 1 ether);

        // Diagnostics: recovered signer from the HTTPS blob, plus what we can learn from the verifier.
        _logVerifierDiagnostics(fetchedBlob);

        // This call should behave exactly like production:
        // - If the HTTPS endpoint returns an update signed by a trusted signer, settlement succeeds.
        // - Otherwise, the verifier reverts (typically `invalid signer`) and this test FAILS.
        //
        // This is intentional: we want the fork test to surface real-chain verifier configuration.
        this._settleSingleMarketExternal(fetchedBlob, endTime, feedId);
    }
}


