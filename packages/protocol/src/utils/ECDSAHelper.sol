// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title ECDSAHelper
 * @notice Shared ECDSA verification helper using tryRecover.
 * @dev Centralizes the tryRecover + address(0) guard pattern to prevent
 *      divergence between contracts (e.g. one using recover, another tryRecover).
 */
library ECDSAHelper {
    /// @notice Verify that `signature` was signed by `expectedSigner` for `hash`.
    /// @dev Uses ECDSA.tryRecover so malformed signatures return false instead of reverting.
    ///      This is critical for contracts that fall through to EIP-1271 on ECDSA failure.
    /// @param hash The EIP-712 typed data hash
    /// @param signature The signature bytes
    /// @param expectedSigner The address that should have signed
    /// @return True if the signature is valid ECDSA and recovers to expectedSigner
    function isValidECDSASignature(
        bytes32 hash,
        bytes memory signature,
        address expectedSigner
    ) internal pure returns (bool) {
        (address recovered, ECDSA.RecoverError err,) =
            ECDSA.tryRecover(hash, signature);

        if (err != ECDSA.RecoverError.NoError || recovered == address(0)) {
            return false;
        }

        return recovered == expectedSigner;
    }
}
