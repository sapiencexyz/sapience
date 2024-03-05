// contracts/GGFactory.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../foil/VirtualToken.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

import "../storage/Epoch.sol";

// It should be a library and used from main contract, otherwise it should be limited to be called only by the main contract
library EpochFactory {
    struct Data {
        IUniswapV3Factory uniFactory;
        uint256[] epochIds;
        uint256 latestEndTime;
        uint256 latestStartTime;
    }

    function load() internal pure returns (Data storage factory) {
        bytes32 s = keccak256(abi.encode("foil.gas.epochFactory"));

        assembly {
            factory.slot := s
        }
    }

    function startEpoch(
        uint256 _startTime,
        uint256 _endTime,
        uint24 fee,
        address tokenOwner
    ) public {
        //uint24 fee = 3000
        Data storage self = load();

        validateEpoch(self, _startTime, _endTime);

        uint256 epochId = self.epochIds.length + 1;
        Epoch.Data storage epoch = Epoch.load(epochId);
        epoch.id = epochId;
        epoch.startTime = _startTime;
        epoch.endTime = _endTime;
        string memory epochIdString = integerToString(epochId);
        epoch.vGas = new VirtualToken(
            address(this),
            string.concat("virtual Gas Token - ", epochIdString),
            string.concat("vGT", epochIdString)
        );
        epoch.vGas.mint(tokenOwner, type(uint256).max);

        // is it necessary to create both virtual tokens every time?
        epoch.vEth = new VirtualToken(
            address(this),
            string.concat("virtual ETH Token - ", epochIdString),
            string.concat("vETH", epochIdString)
        );
        epoch.vEth.mint(tokenOwner, type(uint256).max);
        // epoch.vEth = vEth;
        epoch.pool = IUniswapV3Pool(
            self.uniFactory.createPool(
                address(epoch.vGas),
                address(epoch.vEth),
                fee
            )
        );
        self.epochIds.push(epochId);
    }

    function integerToString(uint _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint j = _i;
        uint len;

        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint k = len - 1;

        while (_i != 0) {
            bstr[k--] = bytes1(uint8(48 + (_i % 10)));
            _i /= 10;
        }
        return string(bstr);
    }

    function validateEpoch(
        Data storage self,
        uint256 _startTime,
        uint256 _endTime
    ) internal {
        if (_startTime < block.timestamp) {
            revert CommonErrors.InvalidStartTime(_startTime);
        }

        if (_endTime < block.timestamp || _endTime < _startTime) {
            revert CommonErrors.InvalidEndTime(_endTime);
        }

        if (self.epochIds.length > 0) {
            if (self.latestEndTime > _startTime) {
                revert CommonErrors.OverlappingEpochs(_startTime);
            }
        }

        self.latestEndTime = _endTime;
        self.latestStartTime = _startTime;
    }
}
