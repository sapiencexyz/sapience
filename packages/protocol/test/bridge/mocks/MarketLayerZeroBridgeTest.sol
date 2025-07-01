// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {MarketLayerZeroBridge} from "../../../src/bridge/MarketLayerZeroBridge.sol";
import {Origin} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

contract MarketLayerZeroBridgeTest is MarketLayerZeroBridge {
    constructor(address _endpoint, address _owner) MarketLayerZeroBridge(_endpoint, _owner) {}

    function exposed_lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external {
        _lzReceive(_origin, _guid, _message, _executor, _extraData);
    }
} 