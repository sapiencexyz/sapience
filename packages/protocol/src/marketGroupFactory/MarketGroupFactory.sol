// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "@openzeppelin/contracts/proxy/Clones.sol";
import {IConfigurationModule} from "../market/interfaces/IConfigurationModule.sol";
import {IFoilStructs} from "../market/interfaces/IFoilStructs.sol";

contract MarketGroupFactory {
    using Clones for address;

    address public immutable implementation;
    address public immutable authorizedOwner;

    event MarketGroupInitialized(
        address indexed marketGroup,
        bytes returnData,
        uint256 nonce
    );

    constructor(address _implementation, address _authorizedOwner) {
        implementation = _implementation;
        authorizedOwner = _authorizedOwner;
    }

    function cloneAndInitializeMarketGroup(
        address owner,
        address collateralAsset,
        address[] calldata feeCollectors,
        address callbackRecipient,
        uint256 minTradeSize,
        IFoilStructs.MarketParams memory marketParams,
        uint256 nonce
    ) external returns (address, bytes memory) {
        require(
            msg.sender == authorizedOwner,
            "Only authorized owner can call this function"
        );

        IConfigurationModule marketGroup = IConfigurationModule(
            implementation.clone()
        );

        bytes memory callData = abi.encodeWithSelector(
            IConfigurationModule.initializeMarket.selector,
            owner,
            collateralAsset,
            feeCollectors,
            callbackRecipient,
            minTradeSize,
            marketParams
        );
        (bool success, bytes memory returnData) = address(marketGroup)
            .delegatecall(callData);

        if (!success) {
            if (returnData.length > 0) {
                // Use assembly to revert with the same error message
                assembly {
                    let data := add(returnData, 0x20) // Skip the length prefix of returnData
                    let dataSize := mload(returnData) // Get the size of returnData
                    revert(data, dataSize)
                }
            } else {
                // If no return data is provided, revert without a message
                revert();
            }
        }

        emit MarketGroupInitialized(address(marketGroup), returnData, nonce);
        return (address(marketGroup), returnData);
    }
}
