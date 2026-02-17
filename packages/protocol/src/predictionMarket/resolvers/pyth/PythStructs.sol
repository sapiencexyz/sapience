// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.19;

/// @notice Minimal Pyth structs used by the pull-oracle interface.
/// @dev This is intentionally vendored (not a full SDK) to keep protocol builds self-contained.
library PythStructs {
    struct Price {
        // Price
        int64 price;
        // Confidence interval around the price
        uint64 conf;
        // Price exponent (base 10). Typically negative for USD-style decimals.
        int32 expo;
        // Timestamp of the price publish event (seconds since unix epoch)
        uint64 publishTime;
    }

    struct PriceFeed {
        // Price feed id
        bytes32 id;
        // Price
        Price price;
        // Exponentially moving average price
        Price emaPrice;
    }
}


