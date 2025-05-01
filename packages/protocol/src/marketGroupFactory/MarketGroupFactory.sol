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

        bytes memory data = abi.encodeWithSelector(
            IConfigurationModule.initializeMarket.selector,
            owner,
            collateralAsset,
            feeCollectors,
            callbackRecipient,
            minTradeSize,
            marketParams
        );
        (bool success, bytes memory returnData) = address(marketGroup)
            .delegatecall(data);

        // If the delegatecall reverted, use assembly to revert with the same error message
        if (!success) {
            assembly {
                let returnDataSize := mload(returnData)
                revert(add(0x20, returnData), returnDataSize)
            }
        }

        emit MarketGroupInitialized(address(marketGroup), returnData, nonce);
        return (address(marketGroup), returnData);
    }
}
