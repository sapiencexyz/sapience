// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {UMALayerZeroBridge} from "../../../src/bridge/UMALayerZeroBridge.sol";
import {Origin} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import {
    MessagingFee,
    MessagingReceipt
} from "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";

contract UMALayerZeroBridgeTest is UMALayerZeroBridge {
    constructor(address _endpoint, address _owner) UMALayerZeroBridge(_endpoint, _owner) {}

    function exposed_lzReceive(
        Origin calldata _origin,
        bytes32 _guid,
        bytes calldata _message,
        address _executor,
        bytes calldata _extraData
    ) external {
        _lzReceive(_origin, _guid, _message, _executor, _extraData);
    }

    // function exposed_sendMessageWithETH(
    //     uint32 _dstEid,
    //     bytes memory _message,
    //     bytes memory _options,
    //     MessagingFee memory _fee
    // ) external payable returns (MessagingReceipt memory) {
    //     return _sendMessageWithETH(_dstEid, _message, _options, _fee);
    // }
}
